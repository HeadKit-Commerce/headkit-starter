#!/usr/bin/env bash
#
# PAO-04 gate harness (phase 14.1, plan 14.1-09).
#
# Deactivates WooCommerce Product Add-Ons on the LOCAL Docker stack, runs the
# WHOLE Playwright suite together with `product-addons-absent.spec.ts`, then
# reactivates — and reactivates on a failed run, a crashed run and a cancelled
# run too, because the trap is registered BEFORE the deactivation rather than
# after the suite.
#
# WHY A SCRIPT AND NOT A `beforeAll`. Playwright's hooks do not run on SIGINT,
# and the shared local stack is used by other sessions on this machine. A
# `beforeAll`/`afterAll` pair leaves the plugin down whenever a run is cancelled
# — the exact denial-of-service this plan's threat register lists as high
# (T-14.1-09-03). A shell trap on EXIT/INT/TERM does not have that hole.
#
# WHAT IT PRINTS, AND WHY THAT IS THE EVIDENCE. The plugin's status is READ BACK
# from WordPress at three points — before the deactivation, immediately after it,
# and after the restore — so the transcript states what happened rather than
# asserting that it must have. The restore reads the status back and FAILS LOUDLY
# (exit 90) if it is not `active`; a harness that reports its own success is the
# class of check this project has recorded burning it before.
#
# LOCAL-ONLY (HARD RULE): every endpoint here is a localhost Docker service and
# the only WordPress it touches is the e2e container. It changes ONE thing — the
# activation state of one plugin — and puts it back.
#
# PORTS. This worktree's stack is starter :3199 / gateway :4199 / commerce :8080
# / WordPress :8090 with store key `pk_e2e_local`, as plans 14.1-05, -06 and -07
# each recorded. The repo-wide defaults (:3000/:4000) belong to OTHER projects
# and sessions on this machine and must never be contacted, so the defaults below
# are this stack's. Override any of them with the matching env var.
#
# USAGE
#   ./e2e/run-plugin-absent-suite.sh                  # the gate: full suite
#   ./e2e/run-plugin-absent-suite.sh --grep "PAO-04"  # extra playwright args
#   HK_ABSENT_DRY_RUN=1 ./e2e/run-plugin-absent-suite.sh   # state + trap only
#
# EXIT CODES
#   0   suite green with the plugin deactivated, plugin restored
#   n   the Playwright exit code, plugin restored
#   2   preconditions not met (nothing was deactivated)
#   90  THE PLUGIN COULD NOT BE RESTORED — the shared stack needs a human

set -uo pipefail

# --- configuration -----------------------------------------------------------

PLUGIN="${HK_PAO_PLUGIN:-woocommerce-product-addons}"
WP_CONTAINER="${HK_WP_CONTAINER:-headkit-e2e-wordpress}"
WP_PATH="${HK_WP_PATH:-/var/www/html}"

export E2E_BASE_URL="${E2E_BASE_URL:-http://localhost:3199}"
export WP_BASE_URL="${WP_BASE_URL:-http://localhost:8090}"
export E2E_GATEWAY_URL="${E2E_GATEWAY_URL:-http://localhost:4199/graphql}"
export E2E_STORE_KEY="${E2E_STORE_KEY:-pk_e2e_local}"

# `Test Product 12` is id 96 on this stack; the repo default (678) does not
# exist here and makes seven unrelated specs fail at their first add-item before
# they measure anything (14.1-07 deferred item 3). Setting it is not a fudge —
# it keeps the comparison against the plugin-ACTIVE baseline like-for-like.
export E2E_CHECKOUT_PRODUCT_ID="${E2E_CHECKOUT_PRODUCT_ID:-96}"

# `product-addons.spec.ts` is the plugin-PRESENT suite and its `readFixture`
# THROWS when a fixture publishes no add-on groups — by design (14.1-07). On a
# deactivated run its failures are the contract working, not a violation, so it
# is excluded here and its 16 cases are accounted for explicitly in the
# case-count comparison rather than silently lost.
ABSENT_SPEC="product-addons-absent.spec.ts"
export E2E_TEST_IGNORE="${E2E_TEST_IGNORE:-product-addons.spec.ts}"

# `next dev` compiles routes on first hit; parallel workers against it produce
# non-deterministic 30s timeouts in `plp-filters` (14.1-07 measured four serial
# runs failing a DIFFERENT set each time). Serialise so the comparison against
# the plugin-active baseline is about the plugin.
WORKERS="${HK_ABSENT_WORKERS:-1}"

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname -- "${SCRIPT_DIR}")"

WPCLI=(docker exec "${WP_CONTAINER}" wp --path="${WP_PATH}" --allow-root)

# --- helpers -----------------------------------------------------------------

log() { printf '%s %s\n' "[$(date -u +%H:%M:%S)]" "$*"; }

# Read the plugin's activation state back OUT OF WORDPRESS. Never inferred from
# the exit code of the command that changed it.
plugin_status() {
  "${WPCLI[@]}" plugin list --name="${PLUGIN}" --field=status 2>/dev/null \
    | tr -d '\r' \
    | tail -1
}

# Does the theme still publish add-on definitions? The endpoint, not the option
# table — this is what every assertion downstream actually reads.
fixture_publishes_addons() {
  curl -s --max-time 10 \
    "${WP_BASE_URL}/wp-json/headkit/v2/products/slug/glam-booth-package" \
    | grep -q '"addons"'
}

# Expire the storefront's product cache. Deactivating the plugin changes what
# `headkit/v2` publishes and Next will keep serving the cached page — 14.1-07
# hit this after re-seeding and recorded it for this plan. The secret is read
# from WordPress and NEVER printed.
revalidate_storefront() {
  local secret paths body code
  secret="$("${WPCLI[@]}" option get headkit_revalidate_secret 2>/dev/null | tr -d '\r' | tail -1)"
  if [ -z "${secret}" ]; then
    log "  revalidate SKIPPED — WordPress holds no headkit_revalidate_secret"
    return 0
  fi
  paths='["/products/glam-booth-package","/products/glam-booth-all-types","/products/glam-booth-file-upload","/products/glam-booth-variable","/products/glam-booth-hidden-first","/products/test-product-12"]'
  body="$(printf '{"secret":"%s","tags":["headkit:products"],"paths":%s}' "${secret}" "${paths}")"
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 \
    -X POST "${E2E_BASE_URL}/api/revalidate" \
    -H 'Content-Type: application/json' \
    -d "${body}")"
  log "  revalidate POST ${E2E_BASE_URL}/api/revalidate → HTTP ${code}"
}

# --- the restore trap --------------------------------------------------------
#
# Registered BEFORE the deactivation below. Everything in it is `&&`-chained, so
# a step that fails cannot let the next one report success on its behalf — plan
# 14.1-01 was corrected on exactly this point after a zsh word-splitting failure
# killed a chain mid-way and a bare `;` would have hidden it.

RESTORE_RAN=0

restore_plugin() {
  local rc=$?
  # Disarm first: the handler itself exits, and without this the EXIT trap
  # re-enters on that exit and recurses.
  trap - EXIT INT TERM
  if [ "${RESTORE_RAN}" -eq 1 ]; then exit "${rc}"; fi
  RESTORE_RAN=1

  echo
  log "=== RESTORE (trap fired; suite exit code ${rc}) ==="
  local at_entry
  at_entry="$(plugin_status)"
  log "  plugin state at trap entry: ${at_entry:-<unreadable>}"

  local final=""
  local attempt
  for attempt in 1 2 3; do
    if "${WPCLI[@]}" plugin activate "${PLUGIN}" >/dev/null 2>&1 \
      && final="$(plugin_status)" \
      && [ "${final}" = "active" ]; then
      log "  reactivated on attempt ${attempt}; status READ BACK: ${final}"
      break
    fi
    final="$(plugin_status)"
    log "  attempt ${attempt} did not leave it active (read back: ${final:-<unreadable>})"
    sleep 2
  done

  # STATE 3 — the end state, read out of WordPress rather than assumed.
  log "  PLUGIN STATE (end): ${final:-<unreadable>}"

  if [ "${final}" != "active" ]; then
    log "  FATAL: the shared local stack is left with ${PLUGIN} = '${final:-unknown}'."
    log "         Restore it by hand:"
    log "           docker exec ${WP_CONTAINER} wp --path=${WP_PATH} --allow-root plugin activate ${PLUGIN}"
    exit 90
  fi

  # Put the storefront's cache back too, so the next session does not read an
  # add-on-less page off a stale entry and take it for a code defect.
  revalidate_storefront

  # And confirm the thing that actually matters to a shopper: the fixture
  # resolves its groups again.
  if fixture_publishes_addons; then
    log "  glam-booth-package publishes its add-on groups again"
  else
    log "  WARNING: the plugin reads active but the fixture publishes no addons key."
    log "           Check the seed and the theme before trusting this stack."
  fi

  log "=== RESTORE COMPLETE — stack left as found ==="
  exit "${rc}"
}

# --- preconditions (nothing is deactivated above this line) -------------------

echo "============================================================"
echo " PAO-04 gate — the plugin-ABSENT full-suite run (14.1-09)"
echo "============================================================"
log "starter   ${E2E_BASE_URL}"
log "wordpress ${WP_BASE_URL} (container ${WP_CONTAINER})"
log "gateway   ${E2E_GATEWAY_URL}"
log "excluded  ${E2E_TEST_IGNORE}   (the plugin-PRESENT suite; see the header)"
echo

command -v curl >/dev/null 2>&1 || { log "FATAL: curl is required"; exit 2; }
command -v docker >/dev/null 2>&1 || { log "FATAL: docker is required"; exit 2; }

if ! "${WPCLI[@]}" option get siteurl >/dev/null 2>&1; then
  log "FATAL: cannot reach WordPress through '${WP_CONTAINER}'. Is the local stack up?"
  exit 2
fi

if ! curl -sf -o /dev/null --max-time 10 "${E2E_BASE_URL}"; then
  log "FATAL: the storefront at ${E2E_BASE_URL} is not answering. Bring the stack up first."
  exit 2
fi

if [ ! -f "${SCRIPT_DIR}/${ABSENT_SPEC}" ]; then
  log "FATAL: ${ABSENT_SPEC} is missing — there is no gate to run."
  exit 2
fi

# STATE 1 — before anything is touched.
START_STATE="$(plugin_status)"
log "PLUGIN STATE (start): ${START_STATE:-<unreadable>}"

if [ "${START_STATE}" != "active" ]; then
  log "FATAL: ${PLUGIN} is '${START_STATE:-unknown}', not 'active', before this run started."
  log "       Another session may already have it down. Nothing was deactivated;"
  log "       resolve the shared-stack state first so the restore has a state to restore TO."
  exit 2
fi

if ! fixture_publishes_addons; then
  log "FATAL: the plugin reads active but glam-booth-package publishes no addons key."
  log "       Re-run docker/wordpress/seed-product-addons.php. Nothing was deactivated."
  exit 2
fi
log "  precondition: glam-booth-package publishes its add-on groups"

# --- ARM THE TRAP, THEN DEACTIVATE -------------------------------------------
#
# This ordering is the whole point of the file. Everything from here on runs
# with a restore guaranteed on exit, interrupt and terminate.

trap restore_plugin EXIT INT TERM
log "restore trap armed on EXIT INT TERM"

echo
log "=== DEACTIVATING ${PLUGIN} ==="
"${WPCLI[@]}" plugin deactivate "${PLUGIN}" >/dev/null 2>&1

# STATE 2 — immediately after the deactivation, read back.
AFTER_STATE="$(plugin_status)"
log "PLUGIN STATE (after deactivate): ${AFTER_STATE:-<unreadable>}"
if [ "${AFTER_STATE}" = "active" ]; then
  log "FATAL: the deactivation did not take. The trap will restore and this run stops."
  exit 2
fi

revalidate_storefront

# The endpoint, not the option table: poll until the theme's `class_exists` gate
# is observably closed. Without this a suite can start against a WordPress that
# has not yet dropped the plugin's hooks, and the failure reads like a code
# defect.
log "  waiting for headkit/v2 to stop publishing the addons key…"
GATE_READY=0
for _ in $(seq 1 20); do
  if ! fixture_publishes_addons; then GATE_READY=1; break; fi
  sleep 1
done
if [ "${GATE_READY}" -ne 1 ]; then
  log "FATAL: headkit/v2 still publishes an addons key with the plugin inactive."
  log "       That is a D-14.1-04 contract violation in its own right — stopping here"
  log "       rather than running a suite whose premise is false."
  exit 1
fi
log "  gate ready: the addons key is absent from the product payload"

if [ "${HK_ABSENT_DRY_RUN:-0}" = "1" ]; then
  echo
  log "HK_ABSENT_DRY_RUN=1 — state transitions and the trap were exercised; no suite run."
  exit 0
fi

# --- the run -----------------------------------------------------------------

echo
log "=== FULL PLAYWRIGHT SUITE, PLUGIN DEACTIVATED (workers=${WORKERS}) ==="
echo

cd "${APP_DIR}" || { log "FATAL: cannot cd to ${APP_DIR}"; exit 2; }

bunx playwright test --workers="${WORKERS}" "$@"
SUITE_RC=$?

echo
log "=== SUITE FINISHED — playwright exit code ${SUITE_RC} ==="
log "    The result line printed by the reporter immediately above IS the gate evidence."
log "    Compare its total case count against the plugin-ACTIVE run: a smaller number"
log "    means something SKIPPED, and a skip in this run is a false pass, not a pass."

exit "${SUITE_RC}"
