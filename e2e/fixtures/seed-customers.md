# Seed fixtures — two distinct customers with orders (IDOR / FE-06)

These fixtures back `e2e/idor-orders.spec.ts`. The IDOR guard needs **two
separate WooCommerce customers**, each owning **at least one distinct order**,
so we can prove customer A's JWT never returns customer B's order.

> **LOCAL-ONLY (HARD RULE):** seed only against the local Docker stack
> (WordPress + WooCommerce at `http://localhost:8090`). Never seed
> staging/prod.

## Local stack prerequisites

Bring the stack up first (see `submodules/headkit-platform/docker/README.md`):

| Service                 | URL                           |
| ----------------------- | ----------------------------- |
| WordPress + WooCommerce | http://localhost:8090         |
| services/commerce (Go)  | http://localhost:8080         |
| Hive Gateway            | http://localhost:4000/graphql |
| starter (Next)          | http://localhost:3000         |

## 1. Create two customers

Use the WooCommerce REST API (`wc/v3`) against the local WP. Replace
`CK`/`CS` with the local consumer key/secret from your WC setup.

```bash
WC=http://localhost:8090/wp-json/wc/v3
AUTH=(-u "$WC_CONSUMER_KEY:$WC_CONSUMER_SECRET")

# Customer A
curl -sS "${AUTH[@]}" -X POST "$WC/customers" \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice.idor@local.test","password":"Passw0rd!A","first_name":"Alice","last_name":"A"}'

# Customer B
curl -sS "${AUTH[@]}" -X POST "$WC/customers" \
  -H 'Content-Type: application/json' \
  -d '{"email":"bob.idor@local.test","password":"Passw0rd!B","first_name":"Bob","last_name":"B"}'
```

Note each returned `id` (the WC customer id) for A and B.

Alternatively with WP-CLI inside the container:

```bash
docker exec -it <wordpress-container> wp wc customer create \
  --email=alice.idor@local.test --password='Passw0rd!A' --user=admin
```

## 2. Create one order per customer

```bash
# Order owned by Customer A (use A's customer id)
curl -sS "${AUTH[@]}" -X POST "$WC/orders" \
  -H 'Content-Type: application/json' \
  -d '{"customer_id":<A_ID>,"status":"processing","line_items":[{"product_id":<ANY_PRODUCT_ID>,"quantity":1}]}'

# Order owned by Customer B (use B's customer id)
curl -sS "${AUTH[@]}" -X POST "$WC/orders" \
  -H 'Content-Type: application/json' \
  -d '{"customer_id":<B_ID>,"status":"processing","line_items":[{"product_id":<ANY_PRODUCT_ID>,"quantity":1}]}'
```

Record the **order `id`** returned for B's order — that is
`E2E_CUSTOMER_B_ORDER_ID`.

## 3. Get customer A's JWT

Log in as customer A through the gateway `Login` mutation (JWT-only auth, no
client-supplied customer id):

```bash
curl -sS -X POST http://localhost:4000/graphql \
  -H 'Content-Type: application/json' \
  -d '{"query":"mutation Login($u:String!,$p:String!){ commerce { login(username:$u,password:$p){ authToken } } }","variables":{"u":"alice.idor@local.test","p":"Passw0rd!A"}}'
```

Take the returned `authToken` — that is `E2E_CUSTOMER_A_JWT`.

> The exact `Login` mutation field shape may differ; confirm against
> `packages/sdk/src/operations/auth.graphql`. The contract that matters: the
> token identifies the customer **server-side**; the client never sends a
> `customer` id.

## 4. Run the IDOR e2e

Export the seeded values and unskip the spec (remove `test.fixme`):

```bash
cd submodules/headkit-platform/apps/starter
export E2E_CUSTOMER_A_JWT='<alice authToken>'
export E2E_CUSTOMER_B_ORDER_ID='<B order id>'
bun run test:e2e -- idor-orders
```

**Expected:** customer A's order list returns ONLY A's orders;
B's order id is absent. If B's order id appears, the IDOR guard FAILS — that
is the cross-customer leak FE-06 must prevent.

## Cleanup

```bash
curl -sS "${AUTH[@]}" -X DELETE "$WC/orders/<order_id>?force=true"
curl -sS "${AUTH[@]}" -X DELETE "$WC/customers/<customer_id>?force=true&reassign=0"
```
