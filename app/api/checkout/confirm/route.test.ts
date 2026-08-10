import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `GET /api/checkout/confirm` — the V1 legacy-return catch-all (MIG-04).
 *
 * V1 storefronts create the WooCommerce order AFTER Stripe succeeds, inside
 * this exact browser-return route. V2 has no such route, so a shopper who was
 * mid-3DS at the domain flip returns to `…/api/checkout/confirm?payment_intent=pi_…`
 * and — without this handler — falls through to `/[...slug]` and 404s with the
 * card already charged and NOTHING anywhere recording it.
 *
 * These cases are the machine evidence for the four truths this route must hold:
 *   1. the legacy path answers with a human holding page, never a not-found;
 *   2. every such request emits exactly ONE structured log line, so a stranded
 *      shopper is findable afterwards (T-15.1-09-01 — the soak gate asserts on
 *      the event name below);
 *   3. the route never creates or finalises an order and never issues a
 *      mutating payment-provider call (T-15.1-09-02);
 *   4. nothing from the query string is reflected into the response
 *      (T-15.1-09-03), and an internal failure still redirects rather than
 *      surfacing a 500 to a shopper holding a charged card (T-15.1-09-06).
 *
 * Mock style mirrors app/api/checkout/sync-line-items/route.test.ts: boundaries
 * mocked, no network, no SDK. `@/lib/env` is deliberately NOT in the import
 * graph — this route must be able to answer even on a misconfigured deploy.
 */

const infoMock = vi.fn();
const errorMock = vi.fn();
const connectionMock = vi.fn();

vi.mock("@/lib/logger", () => ({
  logger: {
    info: (...args: unknown[]) => infoMock(...args),
    error: (...args: unknown[]) => errorMock(...args),
  },
}));

vi.mock("next/server", () => ({
  connection: () => connectionMock(),
}));

const ORIGIN = "https://www.dishee.com.au";
const LEGACY_PATH = "/api/checkout/confirm";
const HOLDING_PAGE = "/checkout/finalising";

/** The exact event name plan 15.1-05's soak gate and 15.1-22's runbook assert on. */
const EVENT = "checkout.legacy_confirm_return";

async function loadRoute(): Promise<typeof import("./route")> {
  return import("./route");
}

async function callGet(url: string): Promise<Response> {
  const { GET } = await loadRoute();
  return GET(new Request(url));
}

/** Everything a client can observe: the redirect target plus the body. */
async function observable(res: Response): Promise<string> {
  const body = await res.clone().text();
  return `${res.headers.get("location") ?? ""}\n${body}`;
}

beforeEach(() => {
  vi.clearAllMocks();
  connectionMock.mockResolvedValue(undefined);
});

describe("GET /api/checkout/confirm — legacy V1 return catch-all", () => {
  it("redirects a well-formed V1 return to the holding page and logs the payment intent by name", async () => {
    const res = await callGet(
      `${ORIGIN}${LEGACY_PATH}?payment_intent=pi_3QabcDEF12345678&payment_intent_client_secret=pi_3QabcDEF12345678_secret_xyz`,
    );

    expect(
      res.status,
      "a V1-shaped return did NOT redirect — a shopper returning from 3DS on a charged card must never fall through to /[...slug] and 404 (MIG-04)",
    ).toBe(303);
    expect(
      res.headers.get("location"),
      "redirect target is not the holding page — the shopper lands nowhere real",
    ).toBe(`${ORIGIN}${HOLDING_PAGE}`);

    expect(
      infoMock,
      "the legacy return emitted no log line — a stranded shopper would be invisible (T-15.1-09-01)",
    ).toHaveBeenCalledTimes(1);
    expect(
      infoMock.mock.calls[0]?.[0],
      "log event name drifted — plan 15.1-05's soak gate asserts on this exact string",
    ).toBe(EVENT);
    expect(
      infoMock.mock.calls[0]?.[1],
      "the payment intent id is missing from the log line — the operator cannot find the charge",
    ).toMatchObject({
      paymentIntent: "pi_3QabcDEF12345678",
      idState: "present",
      path: LEGACY_PATH,
    });
  });

  it("redirects a return carrying NO payment intent and records the absence explicitly", async () => {
    const res = await callGet(`${ORIGIN}${LEGACY_PATH}`);

    expect(
      res.status,
      "a bare legacy hit did not redirect — the route must answer every shape, not just the happy one",
    ).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}${HOLDING_PAGE}`);

    expect(infoMock).toHaveBeenCalledTimes(1);
    expect(
      infoMock.mock.calls[0]?.[1],
      "an absent payment intent must be an EXPLICIT marker, not a silently missing field",
    ).toMatchObject({ paymentIntent: null, idState: "absent" });
  });

  it("redirects a malformed payment intent and logs the rejection without trusting the value", async () => {
    const res = await callGet(
      `${ORIGIN}${LEGACY_PATH}?payment_intent=%3Cscript%3Ealert(1)%3C%2Fscript%3E`,
    );

    expect(
      res.status,
      "a malformed identifier must still redirect — validation failure is not the shopper's problem",
    ).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}${HOLDING_PAGE}`);

    expect(infoMock).toHaveBeenCalledTimes(1);
    expect(
      infoMock.mock.calls[0]?.[1],
      "a value failing shape validation must be recorded as invalid and NOT carried through as if it were an id",
    ).toMatchObject({ paymentIntent: null, idState: "invalid" });
  });

  it("REFLECTION: no raw query-string input reaches the redirect target or the body", async () => {
    const hostile = "<script>alert(1)</script>";
    const res = await callGet(
      `${ORIGIN}${LEGACY_PATH}?payment_intent=${encodeURIComponent(hostile)}&next=${encodeURIComponent("https://evil.test/")}`,
    );

    const seen = await observable(res);
    expect(
      seen,
      "REFLECTED INPUT: raw query-string content appeared in the response (T-15.1-09-03)",
    ).not.toContain("script");
    expect(
      seen,
      "OPEN REDIRECT: an attacker-supplied url reached the redirect target — the holding page path is a constant, never derived from input",
    ).not.toContain("evil.test");
    expect(
      infoMock.mock.calls[0]?.[1],
      "the hostile value was logged verbatim — the log is operator-facing and must carry validated values only",
    ).not.toMatchObject({ paymentIntent: hostile });
  });

  it("exports ONLY a GET handler, so every other verb gets method-not-allowed from the framework", async () => {
    const mod = (await loadRoute()) as Record<string, unknown>;

    expect(
      typeof mod.GET,
      "GET is not exported — the legacy path would 404 instead of answering",
    ).toBe("function");
    for (const verb of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        mod[verb],
        `${verb} is exported from the legacy confirm route — App Router returns 405 for UNEXPORTED verbs, and exporting one re-opens the order-creating shape this route exists to refuse (T-15.1-09-02)`,
      ).toBeUndefined();
    }
  });

  it("NEVER THROWS: an internal failure still yields the holding-page redirect, not a 500", async () => {
    connectionMock.mockRejectedValueOnce(
      new Error("runtime context unavailable"),
    );

    const res = await callGet(
      `${ORIGIN}${LEGACY_PATH}?payment_intent=pi_3QabcDEF12345678`,
    );

    expect(
      res.status,
      "an internal failure surfaced to a shopper holding a charged card — the handler must degrade to the redirect (T-15.1-09-06)",
    ).toBe(303);
    expect(res.headers.get("location")).toBe(`${ORIGIN}${HOLDING_PAGE}`);
    expect(
      errorMock,
      "an internal failure was swallowed with no record at all — the operator needs to know the safety net itself broke",
    ).toHaveBeenCalledTimes(1);
    expect(
      await observable(res),
      "the internal error message leaked to the client",
    ).not.toContain("runtime context unavailable");
  });

  it("emits exactly one log line per request — the soak gate counts lines, not requests", async () => {
    await callGet(`${ORIGIN}${LEGACY_PATH}?payment_intent=pi_ABC123`);
    await callGet(`${ORIGIN}${LEGACY_PATH}?payment_intent=pi_DEF456`);

    expect(
      infoMock.mock.calls.filter((c) => c[0] === EVENT),
      "the line-per-request contract broke — a double-log inflates the soak gate's stranded-shopper count, a missing one hides a real one",
    ).toHaveLength(2);
  });
});
