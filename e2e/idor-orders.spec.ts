import { test, expect, request } from "@playwright/test";

/**
 * IDOR — cross-customer order leak guard (FE-06 / E2E-04 precursor).
 *
 * Phase-2 lesson (project memory: phase2-uat-live-smoke): mocked unit tests
 * missed live boundary bugs. This is a LIVE-STACK e2e against the local Hive
 * gateway — it does NOT mock the WP/Go layer.
 *
 * THREAT (T-03-IH1, STRIDE Information Disclosure): a customer must never be
 * able to read another customer's orders. Scoping is by the JWT in the
 * transport ONLY — there is no client-supplied `customer` id anywhere in this
 * spec (passing one would be the vulnerability we guard against).
 *
 * STATUS: test.fixme until the two seed customers + orders exist locally.
 * See e2e/fixtures/seed-customers.md for the seeding recipe. The assertion
 * logic below is the real guard — only the fixture data is pending.
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
  // Unskip once seed-customers.md has produced two customers with distinct
  // orders and the env vars above are populated.
  test.fixme(
    "customer A's JWT must NOT return customer B's order",
    async () => {
      const api = await request.newContext();

      // Logged-in session as customer A — identity carried ONLY by the JWT.
      // No `customer` id is sent in the query (that would be the IDOR hole).
      const res = await api.post(GRAPHQL_URL, {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${CUSTOMER_A_JWT}`,
        },
        data: {
          query: GET_ORDERS,
          variables: { page: 1, perPage: 50 },
        },
      });

      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body.errors, "GraphQL errors in orders response").toBeUndefined();

      const orders: Array<{ databaseId: number }> =
        body.data.commerce.orders.orders;
      const returnedIds = orders.map((o) => String(o.databaseId));

      // The guard: customer B's order id MUST be absent from A's list.
      expect(returnedIds).not.toContain(CUSTOMER_B_ORDER_ID);

      await api.dispose();
    },
  );
});
