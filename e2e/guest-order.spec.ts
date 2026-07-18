import { test, expect, request } from "@playwright/test";

/**
 * Guest order-key deep-link access proof (FE-07 / D-03).
 *
 * THREAT (T-03-O2, STRIDE Information Disclosure / enumeration): a guest may
 * read an order ONLY via the high-entropy order key emailed in their
 * confirmation. The order key is the secret. There is NO on-site
 * email+order-number lookup form (D-03 — out of scope, prohibited).
 *
 * This is a LIVE-STACK e2e against the local Hive gateway `storeOrder(id, key)`
 * resolver (the same path the guest order-detail page uses via
 * `getOrderAction` → `checkout.getOrder`). It does NOT mock the WP/Go layer.
 *
 * Three cases:
 *   1. correct key  → order resolves (data.commerce.storeOrder != null)
 *   2. missing key  → refuses (no order returned)
 *   3. wrong key    → refuses (no order returned)
 *
 * IDOR-safe contract: the missing-key and wrong-key cases must be
 * INDISTINGUISHABLE — neither returns an order, so a caller cannot use the
 * response to learn whether an order with that id exists (no enumeration
 * oracle). The order key MUST gate access server-side; knowing only the
 * numeric order id must never be sufficient.
 *
 * SEEDING: requires one seeded local order with a known id + key. See
 * e2e/fixtures/seed-customers.md (step 2 records the order id; the order's
 * `order_key` is the secret — capture it from the create-order response or
 * via `wp wc shop_order get <id>`). Export:
 *   - E2E_GUEST_ORDER_ID   (the seeded order's databaseId)
 *   - E2E_GUEST_ORDER_KEY  (that order's order_key — the real secret)
 * If absent (or the stack is down), the spec FAILS LOUDLY rather than skipping.
 *
 * LOCAL-ONLY (HARD RULE): targets the local Docker Hive gateway only.
 */

// LOCAL ONLY — Hive gateway composed from the local commerce subgraph.
const GRAPHQL_URL =
  process.env.E2E_GRAPHQL_URL ?? "http://localhost:4000/graphql";

const GUEST_ORDER_ID = process.env.E2E_GUEST_ORDER_ID ?? "";
const GUEST_ORDER_KEY = process.env.E2E_GUEST_ORDER_KEY ?? "";

// A deliberately wrong key — same shape as a real WooCommerce order key
// (wc_order_<random>) but not the secret for the seeded order.
const WRONG_ORDER_KEY = "wc_order_thiskeyisdefinitelywrong000";

const GET_STORE_ORDER = `
  query GetStoreOrder($id: String!, $key: String!, $billingEmail: String) {
    commerce {
      storeOrder(id: $id, key: $key, billingEmail: $billingEmail) {
        id
        databaseId
        orderKey
        status
      }
    }
  }
`;

async function fetchStoreOrder(
  api: Awaited<ReturnType<typeof request.newContext>>,
  id: string,
  key: string,
) {
  const res = await api.post(GRAPHQL_URL, {
    headers: {
      "Content-Type": "application/json",
      // Mandatory tenant resolution (the spec predated the store-key
      // middleware — contract drift fixed in the autonomous QA run).
      "x-headkit-key": process.env.E2E_STORE_KEY ?? "pk_local",
    },
    data: {
      query: GET_STORE_ORDER,
      variables: { id, key, billingEmail: null },
    },
  });
  expect(
    res.status(),
    "GraphQL gateway unreachable — is the local Hive gateway up on :4000?",
  ).toBe(200);
  return res.json();
}

test.describe("Guest order: key-gated deep-link, no enumeration oracle (FE-07/D-03)", () => {
  test.beforeAll(() => {
    // Fail loudly when the seed fixtures / live stack are not present, instead
    // of silently passing. A passing run MUST mean the guard ran for real.
    expect(
      GUEST_ORDER_ID,
      "E2E_GUEST_ORDER_ID is empty — seed a local order first (see e2e/fixtures/seed-customers.md) and bring the local stack up. This spec does NOT mock.",
    ).not.toBe("");
    expect(
      GUEST_ORDER_KEY,
      "E2E_GUEST_ORDER_KEY is empty — capture the seeded order's order_key (the secret) (see e2e/fixtures/seed-customers.md).",
    ).not.toBe("");
  });

  test("correct key resolves the order", async () => {
    const api = await request.newContext();
    const body = await fetchStoreOrder(api, GUEST_ORDER_ID, GUEST_ORDER_KEY);
    expect(body.errors, "GraphQL errors with the correct key").toBeUndefined();
    const order = body.data?.commerce?.storeOrder;
    expect(
      order,
      "correct order key did NOT resolve the order (FE-07 — valid deep-link must work)",
    ).not.toBeNull();
    expect(String(order.databaseId)).toBe(GUEST_ORDER_ID);
    await api.dispose();
  });

  test("wrong key refuses — order must NOT resolve", async () => {
    const api = await request.newContext();
    const body = await fetchStoreOrder(api, GUEST_ORDER_ID, WRONG_ORDER_KEY);
    const order = body.data?.commerce?.storeOrder ?? null;
    // THE GUARD (T-03-O2): a wrong key must never return the order. If this
    // fails, the order key is not gating access server-side and any numeric
    // order id is readable — a guest-order enumeration leak (FE-07 violation).
    expect(
      order,
      "GUEST ORDER LEAK: a WRONG order key returned the order — the key is not enforced server-side (FE-07/T-03-O2 violation)",
    ).toBeNull();
    await api.dispose();
  });

  test("missing key refuses — and is indistinguishable from wrong key (no oracle)", async () => {
    const api = await request.newContext();
    const body = await fetchStoreOrder(api, GUEST_ORDER_ID, "");
    const order = body.data?.commerce?.storeOrder ?? null;
    // IDOR-safe: missing key behaves exactly like wrong key — no order, so the
    // response cannot be used to learn whether the order exists.
    expect(
      order,
      "missing order key returned the order — key-gate not enforced (FE-07/D-03 violation)",
    ).toBeNull();
    await api.dispose();
  });
});
