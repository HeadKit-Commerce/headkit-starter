import "server-only";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  CORE_OFFLINE_LABELS,
  offlineGateways,
  type PaymentGatewayChoice,
} from "@/lib/payment-gateways";

/**
 * The TITLE and DESCRIPTION a merchant gave an offline
 * gateway, resolved on the SERVER and handed to the Payment step as data.
 *
 * ---------------------------------------------------------------------------
 * The platform does not carry them yet — read this before "fixing" the source
 * ---------------------------------------------------------------------------
 * A WooCommerce offline gateway is two merchant-authored strings and an id:
 * `woocommerce_bacs_settings` holds `title` (merchants commonly re-title
 * `bacs` — "Pay by bank", "Direct deposit", a local scheme name) and
 * `description` (the account details plus whatever "not shipped until the
 * funds have cleared" line the shopper must read to pay at all).
 *
 * NEITHER reaches the storefront today, and that is a property of the schema
 * rather than an assumption: `Cart.paymentMethods` is `[String!]!`
 * (`services/commerce/graph/schema.graphqls`) — gateway ids and nothing else —
 * and no other payment-gateway field exists on `Cart` / `Checkout` /
 * `StoreBranding` / `StorefrontStripeConfig`. The storefront holds no
 * WooCommerce credentials of its own, so it cannot read
 * `wc/v3/payment_gateways` either. Routing the pair properly is the same
 * five-layer change AGENTS.md describes for a product field — the theme's
 * `headkit/v2` payload, the commerce subgraph, the gateway, the SDK's `Cart`
 * fragment, then this module — and is tracked in
 * `docs/tickets/offline-gateway-title-description.md`.
 *
 * Until that lands, the strings come from ONE server-only env var,
 * `OFFLINE_PAYMENT_GATEWAY_DETAILS`, set per store alongside the store's other
 * server configuration. Merchant copy therefore never lives in this
 * repository, and no gateway id is special-cased anywhere:
 *
 *     OFFLINE_PAYMENT_GATEWAY_DETAILS={"bacs":{"title":"Pay by bank","description":"…"}}
 *
 * {@link resolveOfflineGatewayOptions} is the ONE place the pair is resolved.
 * When the platform field lands, it reads the cart's gateway objects there and
 * keeps the env as the override — nothing else in the storefront changes.
 *
 * ---------------------------------------------------------------------------
 * What happens with the var unset
 * ---------------------------------------------------------------------------
 * The gateway keeps WooCommerce's own core label ("Direct bank transfer",
 * "Cheque payment", "Cash on delivery") and carries NO description. The row
 * still renders and the order can still be placed — but the shopper is not
 * shown bank details the store never told us, which is the honest failure.
 */

/** A merchant-authored title/description pair for one gateway id. */
export interface OfflineGatewayDetail {
  title?: string;
  description?: string;
}

/** One offline gateway, as the Payment step renders it. */
export interface OfflineGatewayOption {
  id: string;
  /** The gateway's own WooCommerce title, or its core label as a fallback. */
  title: string;
  /** The merchant's payment instructions. Empty when the store set none. */
  description: string;
}

export const OFFLINE_GATEWAY_DETAILS_ENV = "OFFLINE_PAYMENT_GATEWAY_DETAILS";

let parsed: Readonly<Record<string, OfflineGatewayDetail>> | null = null;
let loggedFailure = false;

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Parse the env var into an id → {title, description} map.
 *
 * A malformed value is NOT a checkout failure: it degrades to the core labels
 * and logs once. A store that mistypes its JSON must still be able to sell.
 */
export function parseOfflineGatewayDetails(
  raw: string | undefined,
): Readonly<Record<string, OfflineGatewayDetail>> {
  const value = asText(raw);
  if (!value) return {};
  try {
    const decoded: unknown = JSON.parse(value);
    if (!decoded || typeof decoded !== "object" || Array.isArray(decoded)) {
      throw new Error("not a JSON object");
    }
    const map: Record<string, OfflineGatewayDetail> = {};
    for (const [id, detail] of Object.entries(
      decoded as Record<string, unknown>,
    )) {
      if (!detail || typeof detail !== "object" || Array.isArray(detail)) {
        continue;
      }
      const { title, description } = detail as Record<string, unknown>;
      const entry: OfflineGatewayDetail = {};
      if (asText(title)) entry.title = asText(title);
      if (asText(description)) entry.description = asText(description);
      if (entry.title || entry.description) map[id] = entry;
    }
    return map;
  } catch (error) {
    if (!loggedFailure) {
      loggedFailure = true;
      // NAMES only, never the value — it is merchant copy, and a parse error
      // message can quote the input.
      logger.info("offline_gateway_details_unparsed", {
        variable: OFFLINE_GATEWAY_DETAILS_ENV,
        reason: error instanceof Error ? error.name : "parse_error",
      });
    }
    return {};
  }
}

/** Test seam: forget the memoised parse (the env is read once per process). */
export function resetOfflineGatewayDetailsCache(): void {
  parsed = null;
  loggedFailure = false;
}

function details(): Readonly<Record<string, OfflineGatewayDetail>> {
  parsed ??= parseOfflineGatewayDetails(
    env.OFFLINE_PAYMENT_GATEWAY_DETAILS ?? undefined,
  );
  return parsed;
}

/**
 * The offline gateways this cart offers, each with the strings the shopper
 * reads. Order is WooCommerce's own — merchants control gateway order.
 */
export function resolveOfflineGatewayOptions(
  paymentMethods: readonly string[] | null | undefined,
): OfflineGatewayOption[] {
  const overrides = details();
  return offlineGateways(paymentMethods).map(
    ({ id, label }: PaymentGatewayChoice): OfflineGatewayOption => {
      const detail = overrides[id];
      return {
        id,
        title: detail?.title || label,
        description: detail?.description ?? "",
      };
    },
  );
}

/**
 * The instructions for a PLACED order, matched by the gateway title
 * WooCommerce stamped on it.
 *
 * The confirmation page has no cart left to read, and the order payload
 * carries `paymentMethodTitle` but NOT the gateway id (`Order` in
 * `@headkit/sdk` has no such field) — so the match is on the title, which is
 * exactly the string this module resolved for the row the shopper picked.
 * Only CONFIGURED gateways can match, which is the right bound: a gateway with
 * no configured description has no instructions to show either way.
 *
 * Returns null for a card / PayPal order, so the panel is absent rather than
 * empty.
 */
export function offlineInstructionsForOrderTitle(
  paymentMethodTitle: string | null | undefined,
): OfflineGatewayOption | null {
  const title = asText(paymentMethodTitle).toLowerCase();
  if (!title) return null;
  for (const [id, detail] of Object.entries(details())) {
    const configured = asText(detail.title) || CORE_OFFLINE_LABELS[id] || id;
    if (configured.toLowerCase() !== title) continue;
    const description = asText(detail.description);
    if (!description) return null;
    return { id, title: configured, description };
  }
  return null;
}
