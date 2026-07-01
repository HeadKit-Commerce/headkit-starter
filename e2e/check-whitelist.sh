#!/usr/bin/env bash
#
# R1 whitelist harness (Phase 08). Proves the generic editorial-content WP route
# refuses non-whitelisted post types server-side: /content/{type}/{slug} must
# return a 4xx for any type outside the {post, page} allowlist.
#
# RED UNTIL PLAN 02 LANDS: today the /content/{type}/{slug} route does not exist,
# so WP returns 404 (a 4xx) — the harness "passes" trivially on a missing route.
# The mitigation in plan 02 makes it return 400 for a non-whitelisted type. Either
# way a non-whitelisted type must be 4xx; a 2xx here is a whitelist BYPASS (R1
# violation — arbitrary post_type resolved from the client).
#
# LOCAL-ONLY (HARD RULE): targets the local Docker WordPress only (:8090).
# Override with WP_BASE_URL for a different local port; never a staging/prod host.
#
# Exit 0 only if BOTH non-whitelisted types return 4xx; non-zero otherwise.

set -u

BASE_URL="${WP_BASE_URL:-http://localhost:8090}"

# Non-whitelisted content types (relative WP REST paths). These MUST be refused
# with a 4xx; `content/attachment` and `content/product` are not in the {post,
# page} allowlist (R1).
NON_WHITELISTED_PATHS=(
  "wp-json/headkit/v2/content/attachment/x"
  "wp-json/headkit/v2/content/product/x"
)

fail=0

for path in "${NON_WHITELISTED_PATHS[@]}"; do
  url="${BASE_URL}/${path}"
  code="$(curl -s -o /dev/null -w '%{http_code}' "${url}")"
  if [[ "${code}" =~ ^4[0-9][0-9]$ ]]; then
    echo "PASS: /${path} → ${code} (rejected, as required)"
  else
    echo "FAIL: /${path} → ${code} (expected 4xx — non-whitelisted type must be refused; R1)"
    fail=1
  fi
done

if [[ "${fail}" -ne 0 ]]; then
  echo "R1 WHITELIST CHECK FAILED: a non-whitelisted content type was not refused with a 4xx."
  exit 1
fi

echo "R1 whitelist check passed: both non-whitelisted types refused with 4xx."
exit 0
