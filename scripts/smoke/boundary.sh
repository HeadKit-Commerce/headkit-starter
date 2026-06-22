#!/usr/bin/env bash
#
# boundary.sh — curl-based WP<->Go boundary smoke for the local Docker stack.
#
# WHY: Phase-2 lost 3 live bugs to unit tests that MOCKED the WP/Go layer
# (project memory: phase2-uat-live-smoke). This script exercises the real
# boundary surfaces against the live local stack so regressions surface early.
#
# LOCAL-ONLY (HARD RULE): the only endpoint is the local Hive gateway.
# Never point this at staging/prod.
#
#   Hive Gateway   http://localhost:4000/graphql   (composes commerce subgraph)
#   (backed by)    WordPress+WC :8090 · commerce :8080
#
# Usage:
#   bash scripts/smoke/boundary.sh
#   GRAPHQL_URL=http://localhost:4000/graphql HK_JWT="<token>" bash scripts/smoke/boundary.sh
#
# Exit code: 0 if every query returns HTTP 200 and a body with no GraphQL
# `errors`; non-zero on the first failure.
#
set -u

# LOCAL ONLY — default to the local Docker Hive gateway.
GRAPHQL_URL="${GRAPHQL_URL:-http://localhost:4000/graphql}"
# Optional customer JWT for the authenticated surfaces (GetCustomer/GetOrders).
# Scoping is JWT-only in the transport — there is no client-supplied customer id.
HK_JWT="${HK_JWT:-}"

# Guard: refuse to run against anything that is not localhost (HARD RULE).
case "$GRAPHQL_URL" in
  http://localhost:*|http://127.0.0.1:*) ;;
  *)
    echo "REFUSING: GRAPHQL_URL must be a localhost Docker endpoint, got: $GRAPHQL_URL" >&2
    exit 2
    ;;
esac

fail=0

# run_query <label> <graphql-query-json> [authenticated]
# Posts the query, asserts HTTP 200 and a body with no top-level `errors`.
run_query() {
  label="$1"
  payload="$2"
  authed="${3:-no}"

  hdr=(-H "Content-Type: application/json")
  if [ "$authed" = "auth" ]; then
    if [ -z "$HK_JWT" ]; then
      echo "SKIP  $label (no HK_JWT set — export HK_JWT to exercise authenticated surfaces)"
      return 0
    fi
    hdr+=(-H "Authorization: Bearer ${HK_JWT}")
  fi

  # Capture body + trailing HTTP status code.
  resp="$(curl -sS -w $'\n%{http_code}' "${hdr[@]}" -X POST "$GRAPHQL_URL" -d "$payload" 2>&1)"
  code="$(printf '%s' "$resp" | tail -n1)"
  body="$(printf '%s' "$resp" | sed '$d')"

  if [ "$code" != "200" ]; then
    echo "FAIL  $label — HTTP $code"
    echo "      $body" | head -c 400
    echo
    fail=1
    return 1
  fi

  # GraphQL transports errors in the body even on HTTP 200.
  if printf '%s' "$body" | grep -q '"errors"'; then
    echo "FAIL  $label — GraphQL errors in body"
    echo "      $body" | head -c 400
    echo
    fail=1
    return 1
  fi

  echo "OK    $label"
  return 0
}

echo "Boundary smoke against $GRAPHQL_URL"
echo "----------------------------------------"

# 1) Navigation (PRIMARY) — header/footer menus from headkit/v2/menus via WP.
run_query "navigation:PRIMARY" \
  '{"query":"query GetNavigation($location: MenuLocation!){ commerce { navigation(location: $location){ id label uri } } }","variables":{"location":"PRIMARY"}}'

# 2) Navigation (SECONDARY) — secondary/footer menu location.
run_query "navigation:SECONDARY" \
  '{"query":"query GetNavigation($location: MenuLocation!){ commerce { navigation(location: $location){ id label uri } } }","variables":{"location":"SECONDARY"}}'

# 3) collections.list with a brand + price filter (FE-02 facet boundary).
run_query "collections.filtered(brand+price)" \
  '{"query":"query GetProducts($filter: ProductListFilter,$page: Int,$perPage: Int){ commerce { products(filter:$filter,page:$page,perPage:$perPage){ products{ id name slug price onSale } total totalPages } } }","variables":{"filter":{"brand":"","minPrice":"0","maxPrice":"100000","onSale":true},"page":1,"perPage":12}}'

# 4) GetCustomer — authenticated; JWT-only, no client-supplied id (FE-04/FE-06).
run_query "customer.me" \
  '{"query":"query GetCustomer{ customer { id email firstName lastName } }"}' \
  auth

# 5) GetOrders — authenticated; orders scoped by JWT in transport (FE-06 IDOR surface).
run_query "orders.list" \
  '{"query":"query GetOrders($page: Int,$perPage: Int){ commerce { orders(page:$page,perPage:$perPage){ orders{ id databaseId orderKey status } total } } }","variables":{"page":1,"perPage":50}}' \
  auth

echo "----------------------------------------"
if [ "$fail" -ne 0 ]; then
  echo "BOUNDARY SMOKE FAILED"
  exit 1
fi
echo "BOUNDARY SMOKE PASSED"
exit 0
