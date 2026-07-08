#!/usr/bin/env bash
#
# CKA-01 acceptance harness (Phase 4.1, Layer 1). Proves the HeadKit
# determine_current_user JWT filter authenticates the WooCommerce Store API
# (wc/store/v1) for a valid Bearer token, stays guest on no/invalid token, and
# is INERT on non-store routes — without any PHP unit harness (the theme has
# none; Layer 1 coverage is integration-only).
#
# What it checks:
#   1. AUTHED    — GET wc/store/v1/cart with a valid Bearer + fresh Cart-Token
#                  resolves the seeded WP user: the cart reflects that user's
#                  saved billing (Sydney) + shipping (Melbourne) from user meta.
#   2. GUEST     — the SAME request with NO Bearer returns a blank-address guest
#                  cart (guest path unchanged).
#   3. INVALID   — a deliberately malformed Bearer behaves IDENTICALLY to guest
#                  (HTTP 200, blank address) — the filter never 401s the cart.
#   4. SCOPE     — the VALID Bearer sent to a NON-store route
#                  (GET /wp-json/wp/v2/users/me) resolves NO user (HTTP 401),
#                  proving the filter never decodes the JWT outside
#                  /wp-json/wc/store/ (acceptance gate for threat T-04.1-02).
#
# The JWT is obtained from the theme login endpoint and is NEVER echoed to
# stdout/logs (only its length is printed).
#
# PREREQUISITE: the seeded fixture user must exist —
#   docker cp docker/wordpress/seed-auth-user.php docker-wordpress-1:/tmp/seed-auth-user.php
#   docker exec docker-wordpress-1 wp eval-file /tmp/seed-auth-user.php --allow-root --path=/var/www/html
# and the Layer 1 filter (headkit-auth.php determine_current_user) must be
# active in the running WP theme.
#
# LOCAL-ONLY (HARD RULE): targets the local Docker WordPress only (:8090).
# Override with WP_BASE_URL for a different local port; never a staging/prod host.
#
# Exit 0 only if ALL four checks pass; non-zero otherwise.

set -u

BASE_URL="${WP_BASE_URL:-http://localhost:8090}"
USER_LOGIN="${HK_TEST_USER:-hk-checkout-test}"
USER_PASS="${HK_TEST_PASS:-HkCheckout!2026}"

# Expected saved-address values for the seeded fixture (docker/wordpress/seed-auth-user.php).
EXPECT_BILLING="12 Test Parade"    # Address A billing (Sydney, AU)
EXPECT_SHIPPING="88 Delivery Way"  # Address A shipping (Melbourne, AU)

command -v jq >/dev/null 2>&1 || { echo "FATAL: jq is required"; exit 2; }
command -v curl >/dev/null 2>&1 || { echo "FATAL: curl is required"; exit 2; }

fail=0

# --- 0. Mint a valid HeadKit JWT for the seeded user (token kept secret) ------
JWT="$(curl -s -X POST "${BASE_URL}/wp-json/headkit/v2/auth/login" \
  -H 'Content-Type: application/json' \
  -d "{\"username\":\"${USER_LOGIN}\",\"password\":\"${USER_PASS}\"}" \
  | jq -r '.accessToken // empty')"

if [[ -z "${JWT}" ]]; then
  echo "FATAL: could not mint a JWT for ${USER_LOGIN} — is the fixture seeded and WP up at ${BASE_URL}?"
  exit 2
fi
echo "Minted JWT for ${USER_LOGIN} (length=${#JWT}, value masked)."

# Helper: fetch a fresh Cart-Token from a no-auth cart request.
fresh_cart_token() {
  curl -s -D- -o /dev/null "${BASE_URL}/wp-json/wc/store/v1/cart" \
    | tr -d '\r' | awk -F': ' 'tolower($1)=="cart-token"{print $2}'
}

# --- 1. AUTHED: valid Bearer resolves the seeded user -------------------------
CT_AUTH="$(fresh_cart_token)"
AUTH_JSON="$(curl -s "${BASE_URL}/wp-json/wc/store/v1/cart" \
  -H "Authorization: Bearer ${JWT}" -H "Cart-Token: ${CT_AUTH}")"
GOT_BILLING="$(echo "${AUTH_JSON}" | jq -r '.billing_address.address_1 // empty')"
GOT_SHIPPING="$(echo "${AUTH_JSON}" | jq -r '.shipping_address.address_1 // empty')"

if [[ "${GOT_BILLING}" == "${EXPECT_BILLING}" && "${GOT_SHIPPING}" == "${EXPECT_SHIPPING}" ]]; then
  echo "PASS [1 AUTHED]: cart resolved to seeded user (billing='${GOT_BILLING}', shipping='${GOT_SHIPPING}')."
else
  echo "FAIL [1 AUTHED]: expected billing='${EXPECT_BILLING}' shipping='${EXPECT_SHIPPING}', got billing='${GOT_BILLING}' shipping='${GOT_SHIPPING}'."
  echo "                 (filter not resolving the user, or fixture not seeded)."
  fail=1
fi

# --- 2. GUEST: no Bearer stays guest (blank address) --------------------------
CT_GUEST="$(fresh_cart_token)"
GUEST_JSON="$(curl -s "${BASE_URL}/wp-json/wc/store/v1/cart" -H "Cart-Token: ${CT_GUEST}")"
G_BILLING="$(echo "${GUEST_JSON}" | jq -r '.billing_address.address_1 // empty')"
G_SHIPPING="$(echo "${GUEST_JSON}" | jq -r '.shipping_address.address_1 // empty')"

if [[ -z "${G_BILLING}" && -z "${G_SHIPPING}" ]]; then
  echo "PASS [2 GUEST]: no-token cart is guest (blank billing/shipping)."
else
  echo "FAIL [2 GUEST]: guest cart leaked an address (billing='${G_BILLING}', shipping='${G_SHIPPING}')."
  fail=1
fi

# --- 3. INVALID: malformed Bearer behaves as guest, never 401 -----------------
CT_BAD="$(fresh_cart_token)"
BAD_CODE="$(curl -s -o /tmp/hk_bad_cart.json -w '%{http_code}' \
  "${BASE_URL}/wp-json/wc/store/v1/cart" \
  -H "Authorization: Bearer not-a-real-jwt.deadbeef.tampered" -H "Cart-Token: ${CT_BAD}")"
B_BILLING="$(jq -r '.billing_address.address_1 // empty' /tmp/hk_bad_cart.json 2>/dev/null)"
rm -f /tmp/hk_bad_cart.json

if [[ "${BAD_CODE}" == "200" && -z "${B_BILLING}" ]]; then
  echo "PASS [3 INVALID]: malformed Bearer stayed guest (HTTP 200, blank address, no 401)."
else
  echo "FAIL [3 INVALID]: malformed Bearer changed the guest path (HTTP ${BAD_CODE}, billing='${B_BILLING}')."
  fail=1
fi

# --- 4. SCOPE: valid Bearer on a NON-store route resolves NO user (401) -------
# Gates T-04.1-02 (filter must be inert outside /wp-json/wc/store/).
ME_CODE="$(curl -s -o /dev/null -w '%{http_code}' \
  "${BASE_URL}/wp-json/wp/v2/users/me" -H "Authorization: Bearer ${JWT}")"

if [[ "${ME_CODE}" == "401" ]]; then
  echo "PASS [4 SCOPE]: valid Bearer on /wp/v2/users/me resolved NO user (HTTP 401) — filter inert off Store API."
else
  echo "FAIL [4 SCOPE]: /wp/v2/users/me returned HTTP ${ME_CODE} with a valid Bearer — filter is authenticating OUTSIDE Store API (T-04.1-02 violation)."
  fail=1
fi

echo
if [[ "${fail}" -ne 0 ]]; then
  echo "CKA-01 HARNESS FAILED — see FAIL lines above."
  exit 1
fi
echo "CKA-01 harness passed: valid Bearer authenticates the Store API cart; no/invalid token stays guest; filter is inert on non-store routes; token never printed."
exit 0
