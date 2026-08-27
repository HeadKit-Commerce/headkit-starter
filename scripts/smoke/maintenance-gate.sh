#!/usr/bin/env bash
#
# maintenance-gate.sh — end-to-end proof of the maintenance gate (cutover G6).
#
# WHY THIS EXISTS RATHER THAN MORE UNIT TESTS: the claim that matters is "the
# flip takes effect with no redeploy", and no unit test can make that claim. So
# this drives a REAL production build of the storefront (`next build` +
# `next start`), flips a REAL Edge Config item through the SDK's real read path,
# and measures the flip against a build that is never rebuilt or restarted.
#
# LOCAL-ONLY (HARD RULE): every endpoint is localhost. Never point this at a
# customer host.
#
# Prerequisites — the local Docker stack (same as the e2e suite):
#   WordPress+WC :8090 · commerce :8080 · Hive gateway :4000
#
# Usage:
#   bash scripts/smoke/maintenance-gate.sh            # build, serve, prove
#   SKIP_BUILD=1 bash scripts/smoke/maintenance-gate.sh
#
# Exit code 0 only if every assertion below holds.
set -u

STUB_PORT="${STUB_PORT:-3998}"
APP_PORT="${APP_PORT:-3111}"
BASE="http://127.0.0.1:${APP_PORT}"
STUB="http://127.0.0.1:${STUB_PORT}/ecfg_proof"
KEY="maintenance_127_0_0_1"
BYPASS_SECRET="proof-operator-bypass-secret"
GATEWAY_URL="${GATEWAY_URL:-http://localhost:4000/graphql}"
PUBLIC_KEY="${PUBLIC_KEY:-pk_e2e_local}"
SECRET_KEY="${SECRET_KEY:-pk_e2e_local}"

pass=0
fail=0
say() { printf '%s\n' "$*"; }
check() { # check <label> <expected> <actual>
  if [ "$2" = "$3" ]; then
    printf '  PASS  %-58s %s\n' "$1" "$3"
    pass=$((pass + 1))
  else
    printf '  FAIL  %-58s expected %s, got %s\n' "$1" "$2" "$3"
    fail=$((fail + 1))
  fi
}
status() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@"; }
header() { curl -s -D - -o /dev/null --max-time 20 "$@"; }

flip() { # flip <json-value>|delete
  if [ "$1" = "delete" ]; then
    body="{\"items\":[{\"operation\":\"delete\",\"key\":\"${KEY}\"}]}"
  else
    body="{\"items\":[{\"operation\":\"update\",\"key\":\"${KEY}\",\"value\":$1}]}"
  fi
  curl -s -o /dev/null -X PATCH "${STUB}/items" \
    -H "Authorization: Bearer proof-token" \
    -H 'Content-Type: application/json' -d "$body"
}

cleanup() {
  [ -n "${STUB_PID:-}" ] && kill "$STUB_PID" 2>/dev/null
  [ -n "${APP_PID:-}" ] && kill "$APP_PID" 2>/dev/null
  return 0
}
trap cleanup EXIT

say "== starting the Edge Config stub on :${STUB_PORT}"
node scripts/smoke/edge-config-stub.mjs "$STUB_PORT" > /tmp/edge-config-stub.log 2>&1 &
STUB_PID=$!
sleep 1

# GLOBAL_CONFIG is the variable Vercel injects today (verified on
# headkit-starter-staging, 2026-08-25). The gate also accepts the pre-rename
# EDGE_CONFIG; section 7 proves that, since reading the wrong name leaves the
# gate silently unarmed forever.
export GLOBAL_CONFIG="${STUB}?token=proof-token"
export MAINTENANCE_BYPASS_SECRET="$BYPASS_SECRET"
export NEXT_PUBLIC_GRAPHQL_URL="$GATEWAY_URL"
export NEXT_PUBLIC_HEADKIT_PUBLIC_KEY="$PUBLIC_KEY"
export HEADKIT_PRIVATE_KEY="$SECRET_KEY"
export NEXT_PUBLIC_FRONTEND_URL="$BASE"
export REVALIDATION_SECRET="proof-revalidation-secret"
export ALLOW_LOCAL_IMAGES=1

if [ "${SKIP_BUILD:-0}" != "1" ]; then
  say "== production build (the artifact under test; never rebuilt after this)"
  bun run build > /tmp/maintenance-proof-build.log 2>&1 ||
    { say "build failed — see /tmp/maintenance-proof-build.log"; exit 1; }
fi

say "== serving the build on :${APP_PORT}"
PORT="$APP_PORT" bun run start > /tmp/maintenance-proof-app.log 2>&1 &
APP_PID=$!
for _ in $(seq 1 60); do
  [ "$(status "$BASE/")" != "000" ] && break
  sleep 1
done

say ""
say "1. flag OFF (no key for this host — every store's normal state)"
flip delete
check "GET / -> 200" 200 "$(status "$BASE/")"
check "x-hk-maintenance-key names the key to create" \
  "x-hk-maintenance-key: ${KEY}" \
  "$(header "$BASE/" | tr -d '\r' | grep -i '^x-hk-maintenance-key' | head -1)"

say ""
say "2. flag ON — same build, no redeploy, no restart"
started=$(date +%s%N)
flip true
elapsed_flip=$(( ($(date +%s%N) - started) / 1000000 ))
code=$(status "$BASE/")
elapsed=$(( ($(date +%s%N) - started) / 1000000 ))
check "GET / -> 503" 503 "$code"
say "        write took ${elapsed_flip}ms; first 503 observed ${elapsed}ms after the write"
check "Retry-After present" "retry-after: 3600" \
  "$(header "$BASE/" | tr -d '\r' | grep -i '^retry-after' | head -1)"
check "not cached" "cache-control: no-store, must-revalidate" \
  "$(header "$BASE/" | tr -d '\r' | grep -i '^cache-control' | head -1)"
check "X-Robots-Tag noindex" "x-robots-tag: noindex, nofollow" \
  "$(header "$BASE/" | tr -d '\r' | grep -i '^x-robots-tag' | head -1)"
check "says why it is dark" "x-hk-maintenance: flag" \
  "$(header "$BASE/" | tr -d '\r' | grep -i '^x-hk-maintenance:' | head -1)"
body=$(curl -s --max-time 20 "$BASE/")
check "branded page rendered" "yes" \
  "$(printf '%s' "$body" | grep -qi "back shortly" && echo yes || echo no)"
check "page needs no external asset" "yes" \
  "$(printf '%s' "$body" | grep -qE '<script|<link |https?://' && echo no || echo yes)"
check "a deep shopper path is dark too" 503 "$(status "$BASE/products/anything")"

say ""
say "3. exemptions, with the flag still ON"
check "/api/revalidate (GET health)" 200 "$(status "$BASE/api/revalidate")"
check "/api/posts-base-path" 200 "$(status "$BASE/api/posts-base-path")"
check "/robots.txt (a 5xx here would deindex the site)" 200 \
  "$(status "$BASE/robots.txt")"
check "a public/ asset the page could reference" 200 \
  "$(status "$BASE/icon-default.svg")"
# /api/checkout/confirm 303s rather than 503 — it must not be gated, and neither
# may its redirect TARGET, or a shopper holding a charged card lands on the
# maintenance page instead of "Payment received".
confirm=$(status "$BASE/api/checkout/confirm?payment_intent=pi_proof")
check "/api/checkout/confirm not gated" "not-503" \
  "$([ "$confirm" = "503" ] && echo 503 || echo not-503)"
check "/checkout/finalising (its redirect target) not gated" 200 \
  "$(status "$BASE/checkout/finalising")"
check "the whole confirm->holding page chain survives" 200 \
  "$(status -L "$BASE/api/checkout/confirm?payment_intent=pi_proof")"
check "/api/checkout/sync-line-items IS gated (mutates a live session)" 503 \
  "$(status -X POST "$BASE/api/checkout/sync-line-items")"

say ""
say "4. operator bypass, with the flag still ON"
jar=$(mktemp)
check "bypass grant redirects" 307 \
  "$(status -c "$jar" "$BASE/?hk-maintenance-bypass=${BYPASS_SECRET}")"
check "bypass cookie then serves the real site" 200 "$(status -b "$jar" "$BASE/")"
check "wrong secret does not bypass" 503 \
  "$(status "$BASE/?hk-maintenance-bypass=wrong-secret")"
check "no cookie does not bypass" 503 "$(status "$BASE/")"
rm -f "$jar"

say ""
say "5. lift — one write, same build"
started=$(date +%s%N)
flip false
code=$(status "$BASE/")
elapsed=$(( ($(date +%s%N) - started) / 1000000 ))
check "GET / -> 200 again" 200 "$code"
say "        site back up ${elapsed}ms after the lifting write"

say ""
say "6. fail path — Edge Config unreadable"
curl -s -o /dev/null -X POST "http://127.0.0.1:${STUB_PORT}/__fail?on=1"
check "a store that is currently UP stays up when the read fails" 200 "$(status "$BASE/")"
curl -s -o /dev/null -X POST "http://127.0.0.1:${STUB_PORT}/__fail?on=0"
flip true
check "store is dark again" 503 "$(status "$BASE/")"
# A 5xx is absorbed by the SDK's own stale-if-error layer, which replays the last
# good value: still dark, and still labelled `flag` because a value WAS returned.
curl -s -o /dev/null -X POST "http://127.0.0.1:${STUB_PORT}/__fail?on=1&status=500"
check "5xx: SDK replays the last good value, store stays dark" 503 \
  "$(status "$BASE/")"
# A 401 (revoked token / deleted store) makes the SDK throw instead, so this is
# the gate's OWN fail path — the memo, not the SDK cache.
curl -s -o /dev/null -X POST "http://127.0.0.1:${STUB_PORT}/__fail?on=1&status=401"
check "401: gate's own fail path keeps a dark store dark" 503 \
  "$(status "$BASE/")"
check "and labels it fail-closed, not flag" "yes" \
  "$(header "$BASE/" | tr -d '\r' | grep -qi '^x-hk-maintenance: fail-closed:' && echo yes || echo no)"
curl -s -o /dev/null -X POST "http://127.0.0.1:${STUB_PORT}/__fail?on=0"
flip delete

say ""
say "7. the pre-rename variable name still arms the gate"
kill "$APP_PID" 2>/dev/null
wait "$APP_PID" 2>/dev/null
unset GLOBAL_CONFIG
export EDGE_CONFIG="${STUB}?token=proof-token"
PORT="$APP_PORT" bun run start > /tmp/maintenance-proof-app-legacy.log 2>&1 &
APP_PID=$!
for _ in $(seq 1 60); do
  [ "$(status "$BASE/")" != "000" ] && break
  sleep 1
done
check "EDGE_CONFIG alone: gate is armed" "x-hk-maintenance-key: ${KEY}" \
  "$(header "$BASE/" | tr -d '\r' | grep -i '^x-hk-maintenance-key' | head -1)"
flip true
check "EDGE_CONFIG alone: flag ON darkens the store" 503 "$(status "$BASE/")"
flip delete

say ""
say "${pass} passed, ${fail} failed"
[ "$fail" -eq 0 ]
