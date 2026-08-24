# Fixture provenance — Dishee live URL inventory (`dishee-url-inventory.json`)

This document is half of the fixture. The JSON is what the gate asserts; this file
is where the numbers came from, why they cannot be produced again, and what a
reader must do if the migration is ever restarted from a point before the capture.

It backs `e2e/store-parity.spec.ts`, the MIG-03 route/parity gate for phase 15.1
(Dishee V1 → V2 migration).

> **NON-LOCAL HOST — OPERATOR WAIVER.** Every other spec in this suite, and
> `playwright.config.ts:6-7` itself, asserts LOCAL-ONLY. `store-parity.spec.ts`
> is the single deliberate exception: it is pointed at a remote host by
> `E2E_BASE_URL`. That waiver is recorded in the spec's own docblock as well, so
> a later reader finds the reason rather than "fixing" the violation. See
> **The waiver** below for its exact bounds.

---

## 1. When the capture ran, against what, and how

| Property                     | Value                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------- |
| Captured                     | `2026-08-09T12:02:31Z`                                                       |
| Source host                  | `www.dishee.com.au` (the **V1** production storefront, before any change)    |
| Captured by                  | phase 15.1, plan **15.1-10**                                                 |
| Raw artifact                 | `.planning/phases/15.1-dishee-migration/artifacts/10-url-inventory-raw.json` |
| Derived into this fixture by | plan **15.1-11**, task 1                                                     |
| Entries                      | **50** — 41 sitemap `<loc>` entries UNION 9 reachable-but-unlisted paths     |
| Result                       | all 50 returned final status **200**, with **zero** redirects                |

Method, as recorded in the raw artifact's own `extraction_method` block:

```
sitemap           GET https://www.dishee.com.au/sitemap.xml -> every <loc>, host-relative
non_sitemap_paths the nine reachable-but-unlisted paths enumerated in 15.1-CONTEXT.md
union             sitemap UNION non-sitemap, deduplicated, sorted by path
request           one unauthenticated GET per url, redirects followed, max 2 req/s,
                  descriptive user agent
```

Nothing credential-bearing or state-bearing was recorded in either direction, and
no personal or order data was recorded. The raw artifact names that property
descriptively rather than by term, so that the artifact does not itself trip the
content checks below; this fixture inherits the same discipline.

**The union matters.** A sitemap-only manifest would have omitted `/wholesale`,
which appears in **no** sitemap entry yet is linked from **both** the navigation
and the footer, and which was deleted from `apps/starter` in commit `62fd2ae9`.
It is in the inventory, and it stays.

---

## 2. Why it cannot be recaptured

Two independent one-way doors close over this input. After either one, the source
of these numbers no longer exists:

1. **The in-place WordPress theme upgrade (`0.4.2 → 0.4.22`, decision D-15-03).**
   Theme `v0.4.3` deleted every GraphQL registration the theme owned — twelve
   tombstoned registrations that Dishee's live V1 storefront still queries. The
   moment the live theme is upgraded, V1's pages break, so the pages this capture
   fingerprinted can no longer be rendered by V1.
2. **The domain flip (`www.dishee.com.au` moved to the V2 Vercel project).**
   After the flip the hostname serves V2. There is no host left that answers as
   V1 did.

There is also no rollback artifact to fall back on: `push-theme-pressable.sh:203`
deletes `theme.old` inside the same `set -e` shell that performs the swap, so
after a successful push the previous theme does not exist on the host.

**Therefore this file, and the raw artifact it derives from, are the only surviving
record of what V1 served.** Do not delete either, and do not "refresh" this
fixture from a V2 host — that would make the gate assert that V2 matches itself.

### If the migration is restarted from before those points

Only meaningful while the source host still answers as V1. Re-run the capture and
re-derive:

```sh
# 1. re-capture (read-only; unauthenticated; be polite — the source is a live store)
#    see .planning/phases/15.1-dishee-migration/15.1-10-PLAN.md for the exact procedure
curl -s https://<source-host>/sitemap.xml | grep -oE '<loc>[^<]+' | cut -c6-
#    then append the nine non-sitemap paths from 15.1-CONTEXT.md <code_context>
#    and record, per url: final status, final url, title, and the fingerprint object

# 2. re-derive this fixture from the new raw artifact
#    (the derivation is mechanical: see § 4 below for every rule it applies)
```

If the source host no longer answers as V1, the capture **cannot** be reproduced
and no substitute exists. Say so; do not synthesise one.

---

## 3. The V1 baseline — recorded, deliberately not "fixed"

The capture recorded three things that look like defects and are not. They are
pre-existing **V1** behaviour. The entire purpose of a baseline is that V2 is not
blamed for them, so the fixture asserts **nothing** that would flag them:

| Observation                                                               | Fixture treatment                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/new` and `/sale` return **200 with zero product cards**                 | `min_product_cards: 0` + `baseline_zero_cards: true` + a `baseline_note`. The plan's "floor at 1" rule is **not** applied here — see § 4.                                                                                          |
| `/posts` is empty (Dishee has an empty blog)                              | same treatment                                                                                                                                                                                                                     |
| `/shop` lists **24** distinct PDP links against **25** published products | `/shop` carries `min_product_cards: 24`, the observed number — not 25. The catalogue-completeness claim is made by the separate product-count assertion over the 25 `kind: product` entries, which is the right instrument for it. |

`/cart` is carried with `expected_status: 200` even though `apps/starter` has no
`/cart` route (V2 uses a drawer) and it may resolve only through the generic
WordPress page catch-all. That is intentional: the fixture states what V2 **must**
do, and the spec is expected to be RED until the phase's storefront work lands. If
a later plan decides `/cart` should redirect instead, the fix is to set that
entry's `expected_final_path` **and** a `redirect_reason` — the spec rejects a
declared redirect that carries no reason.

---

## 4. Derivation rules — raw capture → fixture

The raw capture records what V1 **does**. The fixture records what V2 **must do**.
Every rule below was applied mechanically to all 50 entries.

| Field                          | Rule                                                                                                                                                                                                                                                                                        |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expected_final_path`          | the requested `path` itself for every entry. **No redirect is declared anywhere**, because D-15-04 preserves the nested `/shop/{cat}[/{sub}]/{slug}` shape rather than redirecting it.                                                                                                      |
| `redirect_reason`              | mandatory on any entry whose `expected_final_path` differs from its `path`. There are none today. A declared redirect without a reason makes the **whole fixture invalid** — the spec rejects it rather than skipping the entry, because a skipped entry is a silently shrinking inventory. |
| `expected_status`              | `200` for every entry (every captured entry was 200).                                                                                                                                                                                                                                       |
| `excluded` / `excluded_reason` | set when the capture recorded a **non-200** final status. **There are ZERO such entries** — see § 6.                                                                                                                                                                                        |
| `observed_on_source`           | the capture's own numbers, carried beside each expectation so a reader can re-judge the expectation instead of trusting the derivation. Never itself asserted.                                                                                                                              |

Per-kind expectations (kind vocabulary is the raw artifact's `kind_rule`):

| Kind         | Count | Expectation                                                                                                                          |
| ------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `product`    | 25    | `min_product_detail_markers: 2` (of three: product JSON-LD, offer JSON-LD, an add-to-cart affordance) and `canonical_expected: true` |
| `category`   | 9     | `min_product_cards` = the observed card count                                                                                        |
| `listing`    | 5     | `min_product_cards` = the observed card count, or `0` + `baseline_zero_cards` where the observation was zero                         |
| `editorial`  | 8     | `min_body_text_length: 200`                                                                                                          |
| `functional` | 3     | `status_only: true`                                                                                                                  |

Two derivation decisions are deliberate departures from the plan's literal text,
both because the literal rule would have asserted something false. They are named
here rather than applied silently:

1. **"floored at 1" is applied only where the observation was ≥ 1.** Applying it to
   `/new`, `/sale` and `/posts` would assert that V2 must render products on pages
   V1 renders none on — converting a recorded V1 baseline into a manufactured V2
   regression, which is precisely what the baseline exists to prevent. Those three
   carry `min_product_cards: 0` and an explicit `baseline_zero_cards` marker so the
   weakness is visible in the data rather than hidden in a number.
2. **`min_body_text_length` is a flat conservative floor (200 characters), not a
   figure derived from `html_bytes`.** `html_bytes` is downloaded markup — tags,
   inline script, streamed payload — which is not the same quantity as rendered
   text length and is not comparable between two different storefront
   implementations. A number derived from it would look derived and measure
   nothing. The floor's job is to catch an empty shell or an error page.

---

## 5. Product-card counting differs between capture and gate — on purpose

The capture counted _distinct hrefs matching `/shop/<seg>/<seg>…`_, because that is
the PDP link shape V1 emits. V2's product cards used to link the **flat**
`/products/{slug}` shape; since the 2026-08-22 canonical decision they link the
nested shape too (`productPath` in `lib/canonical-path.ts`), and the flat one 308s
onto it — a store still on WooCommerce's default `/product/` permalink base keeps
the flat shape as its canonical.

The gate therefore counts distinct same-origin PDP links under **either** shape —
`/products/<slug>` or `/shop/<cat>[/<sub>]/<slug>` — and compares that count against
the number the capture observed. The **number** is transplanted; the **selector**
is not: it stays shape-agnostic so the gate measures card COUNT and never becomes a
second assertion about which URL shape wins.

---

## 6. Excluded entries

**There are none.** Every one of the 50 captured entries returned a final status of
200, so the plan's exclusion rule — _"any raw entry whose final status was not
200"_ — selects nothing.

This is recorded explicitly because the plan's acceptance criteria expect excluded
entries to be listed. The honest answer is that the rule found none, not that the
list is missing. The `excluded` field is written as `false` on all 50 entries
rather than omitted, so the count is machine-readable and a future non-200 entry
has an obvious place to go. The spec prints the skipped count on every run —
including when it is zero — so an inventory that starts quietly shrinking is
visible in the run output rather than inferred from a passing gate.

---

## 7. The waiver

`playwright.config.ts:6-7` states the suite-wide rule: _"LOCAL-ONLY (HARD RULE):
every target is a localhost Docker endpoint. No staging/prod host may appear in
this file."_ The project's `CLAUDE.md` carries the same rule for build/dev work.

`store-parity.spec.ts` runs against a **remote** host. This is an explicit operator
waiver, not an oversight, and it is bounded:

- **No host is hardcoded.** `E2E_BASE_URL` is required and has **no default** in
  this spec; unset makes the spec fail loudly rather than quietly sweep localhost.
  The customer hostname appears nowhere in the spec.
- **Read-only by construction.** The spec issues `GET` only. It signs nothing in,
  submits no form, adds nothing to a cart, and performs no checkout action of any
  kind.
- **The transacting specs must never join this run.** Dishee's Stripe account is
  **LIVE**, not test. The safe invocation names this one file:
  `bunx playwright test e2e/store-parity.spec.ts --project=chromium`.
  `E2E_TEST_IGNORE` exists as defence in depth, but it is a **denylist** and a
  denylist fails open on any spec added after it was written — so naming the single
  file is the primary control, not the denylist.

---

## 8. Running the gate

```sh
cd submodules/headkit-platform/apps/starter

# against the temporary host, before the flip
E2E_BASE_URL=https://<slug>.headkit.app \
PARITY_URL_INVENTORY="$PWD/e2e/fixtures/dishee-url-inventory.json" \
PARITY_TEMP_HOST=true \
bunx playwright test e2e/store-parity.spec.ts --project=chromium

# against the live host, after the flip — same fixture, same spec, comparable run
E2E_BASE_URL=https://www.dishee.com.au \
PARITY_URL_INVENTORY="$PWD/e2e/fixtures/dishee-url-inventory.json" \
PARITY_TEMP_HOST=false \
bunx playwright test e2e/store-parity.spec.ts --project=chromium
```

| Variable               | Required                        | Meaning                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_BASE_URL`         | yes, no default                 | the origin under test                                                                                                                                                                                                                                                                                                                                     |
| `PARITY_TEMP_HOST`     | yes, `true`/`false`, no default | whether this run targets a temporary host. `true` asserts the host is non-indexable and advertises no sitemap; `false` asserts the live posture. Neither branch skips.                                                                                                                                                                                    |
| `PARITY_URL_INVENTORY` | **yes, no default**             | path to the url inventory the run sweeps — this file, for Dishee. Since plan 15.2a-05 the spec is store-agnostic and several stores' inventories sit side by side in `e2e/fixtures/`, so there is no default: unset aborts in the before-all hook naming this variable, because a default would sweep one store's host against another store's inventory. |

---

## 9. Cross-references

- `.planning/phases/15.1-dishee-migration/artifacts/10-url-inventory-raw.json` — the capture
- `.planning/phases/15.1-dishee-migration/15.1-CONTEXT.md` — `<code_context>` "Dishee's shape", traps 10 and 13
- `.planning/phases/15.1-dishee-migration/15.1-VALIDATION.md` — the six rows this gate is the automated command for
- `e2e/store-parity.spec.ts` — the consumer
