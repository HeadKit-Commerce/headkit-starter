import "server-only";
import { logger, errorFields } from "@/lib/logger";
import { getPayPalConfig, type PayPalConfig } from "@/lib/paypal/config";

/**
 * The only place this storefront talks to PayPal.
 *
 * Every function here takes an explicit {@link PayPalConfig} rather than
 * reading the env itself, so a caller cannot reach PayPal without having
 * already passed the enable gate, and so the tests drive real code with a
 * fabricated config instead of mutating `process.env`.
 *
 * Errors are surfaced as {@link PayPalApiError}, which carries the HTTP status
 * and PayPal's own `name`/`debug_id` — never the raw response body, which can
 * echo request content into a log (`lib/logger.ts` contract).
 */

export class PayPalApiError extends Error {
  readonly status: number;
  readonly debugId: string | undefined;
  readonly issue: string | undefined;

  constructor(
    operation: string,
    status: number,
    debugId?: string,
    issue?: string,
  ) {
    super(`PayPal ${operation} failed (${status})`);
    this.name = "PayPalApiError";
    this.status = status;
    this.debugId = debugId;
    this.issue = issue;
  }
}

/** Access tokens are per-credential-set and live ~9h; cache until shortly before. */
let tokenCache: { key: string; token: string; expiresAt: number } | null = null;

const TOKEN_EXPIRY_MARGIN_MS = 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

function cacheKey(config: PayPalConfig): string {
  // The client id is public and the base distinguishes live from sandbox; the
  // secret is deliberately NOT part of the key material that sits in memory.
  return `${config.apiBase}:${config.clientId}`;
}

/** Reset the cached token. Exported for tests; never called in app code. */
export function __resetPayPalTokenCache(): void {
  tokenCache = null;
}

async function paypalFetch(
  url: string,
  init: RequestInit,
  operation: string,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    logger.error("paypal_request_failed", {
      operation,
      ...errorFields(error),
    });
    throw new PayPalApiError(operation, 0);
  } finally {
    clearTimeout(timer);
  }
}

/** Read PayPal's structured error fields without letting the body into a log. */
async function toApiError(
  response: Response,
  operation: string,
): Promise<PayPalApiError> {
  let debugId: string | undefined;
  let issue: string | undefined;
  try {
    const body = (await response.json()) as {
      debug_id?: unknown;
      name?: unknown;
      details?: Array<{ issue?: unknown }>;
    };
    if (typeof body.debug_id === "string") debugId = body.debug_id;
    const detailIssue = body.details?.[0]?.issue;
    if (typeof detailIssue === "string") issue = detailIssue;
    else if (typeof body.name === "string") issue = body.name;
  } catch {
    // A non-JSON error body tells us nothing we are allowed to log.
  }
  const error = new PayPalApiError(operation, response.status, debugId, issue);
  logger.error("paypal_api_error", {
    operation,
    status: response.status,
    ...(debugId ? { debugId } : {}),
    ...(issue ? { issue } : {}),
  });
  return error;
}

export async function getPayPalAccessToken(
  config: PayPalConfig,
): Promise<string> {
  const key = cacheKey(config);
  const now = Date.now();
  if (tokenCache && tokenCache.key === key && tokenCache.expiresAt > now) {
    return tokenCache.token;
  }

  const basic = Buffer.from(
    `${config.clientId}:${config.clientSecret}`,
  ).toString("base64");
  const response = await paypalFetch(
    `${config.apiBase}/v1/oauth2/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basic}`,
      },
      body: "grant_type=client_credentials",
    },
    "oauth_token",
  );
  if (!response.ok) throw await toApiError(response, "oauth_token");

  const body = (await response.json()) as {
    access_token?: unknown;
    expires_in?: unknown;
  };
  if (typeof body.access_token !== "string" || !body.access_token) {
    throw new PayPalApiError("oauth_token", response.status);
  }
  const expiresInMs =
    (typeof body.expires_in === "number" ? body.expires_in : 300) * 1000;
  tokenCache = {
    key,
    token: body.access_token,
    expiresAt: now + Math.max(expiresInMs - TOKEN_EXPIRY_MARGIN_MS, 0),
  };
  return body.access_token;
}

async function authedJson<T>(
  config: PayPalConfig,
  path: string,
  init: { method: string; body?: unknown; headers?: Record<string, string> },
  operation: string,
): Promise<T> {
  const token = await getPayPalAccessToken(config);
  const response = await paypalFetch(
    `${config.apiBase}${path}`,
    {
      method: init.method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...(init.headers ?? {}),
      },
      ...(init.body === undefined ? {} : { body: JSON.stringify(init.body) }),
    },
    operation,
  );
  if (!response.ok) throw await toApiError(response, operation);
  // PATCH answers 204 with no body.
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** The subset of PayPal's Orders v2 order we read. */
export interface PayPalOrder {
  id: string;
  status: string;
  payer?: {
    email_address?: string;
    name?: { given_name?: string; surname?: string };
    address?: PayPalAddress;
  };
  purchase_units?: Array<{
    reference_id?: string;
    custom_id?: string;
    invoice_id?: string;
    amount?: { currency_code?: string; value?: string };
    shipping?: {
      name?: { full_name?: string };
      address?: PayPalAddress;
    };
    payments?: {
      captures?: PayPalCapture[];
    };
  }>;
}

export interface PayPalAddress {
  address_line_1?: string;
  address_line_2?: string;
  admin_area_1?: string;
  admin_area_2?: string;
  postal_code?: string;
  country_code?: string;
}

export interface PayPalCapture {
  id: string;
  status: string;
  amount?: { currency_code?: string; value?: string };
  custom_id?: string;
  invoice_id?: string;
  supplementary_data?: { related_ids?: { order_id?: string } };
}

export function createPayPalOrder(
  config: PayPalConfig,
  payload: unknown,
): Promise<PayPalOrder> {
  return authedJson<PayPalOrder>(
    config,
    "/v2/checkout/orders",
    { method: "POST", body: payload },
    "create_order",
  );
}

export function getPayPalOrder(
  config: PayPalConfig,
  orderId: string,
): Promise<PayPalOrder> {
  return authedJson<PayPalOrder>(
    config,
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    { method: "GET" },
    "get_order",
  );
}

export function capturePayPalOrder(
  config: PayPalConfig,
  orderId: string,
): Promise<PayPalOrder> {
  return authedJson<PayPalOrder>(
    config,
    `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
    { method: "POST", body: {} },
    "capture_order",
  );
}

export function patchPayPalOrder(
  config: PayPalConfig,
  orderId: string,
  operations: unknown[],
): Promise<void> {
  return authedJson<void>(
    config,
    `/v2/checkout/orders/${encodeURIComponent(orderId)}`,
    { method: "PATCH", body: operations },
    "patch_order",
  );
}

/**
 * Refund a capture in full. The ONLY refund this storefront issues is the
 * anti-tamper auto-refund in `capture-order` — merchant refunds go through
 * WooCommerce → dashboard-api `POST /woocommerce/refund-paypal`, which already
 * exists for PayPal orders.
 */
export function refundPayPalCapture(
  config: PayPalConfig,
  captureId: string,
  noteToPayer: string,
): Promise<{ id: string; status: string }> {
  return authedJson<{ id: string; status: string }>(
    config,
    `/v2/payments/captures/${encodeURIComponent(captureId)}/refund`,
    { method: "POST", body: { note_to_payer: noteToPayer } },
    "refund_capture",
  );
}

/** The five transmission headers PayPal signs a webhook with. */
export interface PayPalWebhookHeaders {
  transmissionId: string;
  transmissionTime: string;
  transmissionSig: string;
  certUrl: string;
  authAlgo: string;
}

/**
 * Verify a webhook via PayPal's own endpoint.
 *
 * The documented alternative — verifying the signature locally against the
 * cert at `paypal-cert-url` — is faster and PayPal prefers it, but it requires
 * pinning `cert_url` to a `*.paypal.com` allowlist, and an unvalidated
 * `cert_url` is a signature-forgery hole. Hand-rolling that is not the first
 * thing to build; the API call is the safe default.
 *
 * `event` is passed as the ALREADY-PARSED object rather than the raw string
 * because PayPal's verify endpoint takes `webhook_event` as JSON, not text.
 * The caller still reads the raw body first and parses once, so what is
 * verified and what is acted on are the same bytes.
 *
 * Returns false on any failure — a verification we could not complete is not a
 * verification that passed.
 */
export async function verifyPayPalWebhookSignature(
  config: PayPalConfig,
  webhookId: string,
  headers: PayPalWebhookHeaders,
  event: unknown,
): Promise<boolean> {
  try {
    const body = await authedJson<{ verification_status?: string }>(
      config,
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: {
          transmission_id: headers.transmissionId,
          transmission_time: headers.transmissionTime,
          cert_url: headers.certUrl,
          auth_algo: headers.authAlgo,
          transmission_sig: headers.transmissionSig,
          webhook_id: webhookId,
          webhook_event: event,
        },
      },
      "verify_webhook_signature",
    );
    return body.verification_status === "SUCCESS";
  } catch {
    return false;
  }
}

/** Resolve the config or throw — for call sites that already gated on it. */
export function requirePayPalConfig(): PayPalConfig {
  const config = getPayPalConfig();
  if (!config) throw new Error("PayPal is not configured");
  return config;
}
