import { test, expect, request } from "@playwright/test";

/**
 * IDOR — cross-customer order leak guard (FE-06 / E2E-04 precursor).
 *
 * Phase-2 lesson (project memory: phase2-uat-live-smoke): mocked unit tests
 * missed live boundary bugs. This is a LIVE-STACK e2e against the local Hive
 * gateway — it does NOT mock the WP/Go layer.
 *
 * THREAT (T-03-O1, STRIDE Information Disclosure): a customer must never be
 * able to read another customer's orders. Scoping is by the JWT in the
 * transport ONLY — there is no client-supplied `customer` id anywhere in this
 * spec (passing one would be the vulnerability we guard against).
 *
 * BACKEND VERIFIED (03-07): the Go `Orders` resolver
 * (services/commerce/graph/schema.resolvers.go) takes no client customer id —
 * it derives the customer from the validated JWT via
 * `AuthSvc.GetCustomer(ctx, store, authToken)` and scopes
 * `CheckoutSvc.ListOrders(ctx, store, customer.ID, …)`. This spec proves that
 * end-to-end against the live local stack.
 *
 * SEEDING: requires two seeded local customers with distinct orders. See
 * e2e/fixtures/seed-customers.md. Export E2E_CUSTOMER_A_JWT and
 * E2E_CUSTOMER_B_ORDER_ID before running. If they are absent (or the stack is
 * down), the spec FAILS LOUDLY rather than silently skipping — a green run
 * must mean the guard was actually exercised.
 *
 * LOCAL-ONLY (HARD RULE): targets the local Docker Hive gateway only.
 */

// LOCAL ONLY — Hive gateway composed from the local commerce subgraph.
const GRAPHQL_URL =
  process.env.E2E_GRAPHQL_URL ?? "http://localhost:4000/graphql";

// Populated by the seed step (see e2e/fixtures/seed-customers.md):
//   - JWT for customer A (the logged-in session under test)
//   - the databaseId of an order that belongs to customer B
const CUSTOMER_A_JWT = process.env.E2E_CUSTOMER_A_JWT ?? "";
const CUSTOMER_B_ORDER_ID = process.env.E2E_CUSTOMER_B_ORDER_ID ?? "";

const GET_ORDERS = `
  query GetOrders($page: Int, $perPage: Int) {
    commerce {
      orders(page: $page, perPage: $perPage) {
        orders {
          id
          databaseId
          orderKey
          status
        }
        total
      }
    }
  }
`;

test.describe("IDOR: orders are JWT-scoped, no cross-customer leak (FE-06)", () => {
  test("customer A's JWT must NOT return customer B's order", async () => {
    // Fail loudly when the seed fixtures / live stack are not present, instead
    // of silently passing. A passing run MUST mean the guard ran for real.
    expect(
      CUSTOMER_A_JWT,
      "E2E_CUSTOMER_A_JWT is empty — seed two local customers first (see e2e/fixtures/seed-customers.md) and bring the local stack up. This spec does NOT mock.",
    ).not.toBe("");
    expect(
      CUSTOMER_B_ORDER_ID,
      "E2E_CUSTOMER_B_ORDER_ID is empty — seed customer B's order first (see e2e/fixtures/seed-customers.md).",
    ).not.toBe("");

    const api = await request.newContext();

    // Logged-in session as customer A — identity carried ONLY by the JWT.
    // No `customer` id is sent in the query (that would be the IDOR hole).
    // x-headkit-key resolves the tenant store (mandatory since the commerce
    // store-resolution middleware; the spec predated it — locator/contract
    // drift fixed in the autonomous QA run).
    const res = await api.post(GRAPHQL_URL, {
      headers: {
        "Content-Type": "application/json",
        "x-headkit-key": process.env.E2E_STORE_KEY ?? "pk_local",
        Authorization: `Bearer ${CUSTOMER_A_JWT}`,
      },
      data: {
        query: GET_ORDERS,
        variables: { page: 1, perPage: 50 },
      },
    });

    expect(
      res.status(),
      "GraphQL gateway unreachable — is the local Hive gateway up on :4000?",
    ).toBe(200);
    const body = await res.json();
    expect(body.errors, "GraphQL errors in orders response").toBeUndefined();

    const orders: Array<{ databaseId: number }> =
      body.data.commerce.orders.orders;
    const returnedIds = orders.map((o) => String(o.databaseId));

    // The guard: customer B's order id MUST be absent from A's list.
    expect(
      returnedIds,
      "IDOR LEAK: customer B's order id appeared in customer A's JWT-scoped list (FE-06 violation)",
    ).not.toContain(CUSTOMER_B_ORDER_ID);

    await api.dispose();
  });
});
