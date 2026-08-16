# Fixture provenance — Pebblr Booth live URL inventory (`pebblr-url-inventory.json`)

This document is half of the fixture. The JSON is what the gate asserts; this file is
where the numbers came from, why they cannot be produced again, and what a reader must
do if the migration is ever restarted from a point before the capture.

It backs `e2e/store-parity.spec.ts`, the store-agnostic MIG-03 route/parity gate, for
phase **15.2a** (Pebblr Booth rehearsal) and the 15.2b cutover that follows it.

> **NON-LOCAL HOST — OPERATOR WAIVER.** Every other spec in this suite, and
> `playwright.config.ts:6-7` itself, asserts LOCAL-ONLY, and the project's
> `.claude/CLAUDE.md` carries the same rule as a HARD RULE for all build/dev work.
> `store-parity.spec.ts` is the single deliberate exception: it is pointed at a remote
> host by `E2E_BASE_URL`, and the capture that produced this fixture read a **live
> paying customer's storefront**. That waiver is recorded in the spec's own docblock as
> well, so a later reader finds the reason rather than "fixing" an apparent violation.
> See **§ 7 The waiver** below for its exact bounds and where the authorization was
> granted.

---

## 1. When the capture ran, against what, and how

| Property                         | Value                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Captured                         | `2026-08-16T06:59:55Z`                                                                                                            |
| Source host                      | **`pebblrbooth.com.au`** — the **V1** production storefront, before any change. The **apex**, not `www.`                          |
| Captured by                      | phase 15.2a, plan **15.2a-06**, task 2                                                                                            |
| Raw artifact                     | `.planning/phases/15.2-pebblr-booth-rehearsal/artifacts/15.2a-06-url-inventory-raw.json`                                          |
| Derived into this fixture by     | plan **15.2a-06**, task 3                                                                                                         |
| Entries                          | **59** — 54 swept, plus 5 auth-gated routes carried as explicit exclusions                                                        |
| Union                            | **54 swept** = 32 sitemap `<loc>` entries ∪ 17 rendered-linked paths in no sitemap ∪ 5 public routes only the source tree exposes |
| Result                           | all 54 swept urls returned final status **200**, with **zero** redirect hops                                                      |
| Requests issued to the live host | **70** against an approved budget of 150                                                                                          |
| Rate                             | **0.658 req/s** over the main sweep, against an approved ceiling of 1 req/s                                                       |

**Why the apex and not `www.`** — `www.pebblrbooth.com.au` is a _redirect_, not a serving
host. That was read from the live V1 Vercel project's own domain list
(`GET /v9/projects/{id}/domains`, team `headkit`) in plan 15.2a-01, not taken from a
planning document. Capturing against `www.` would have recorded a redirect hop on 100 %
of entries that is an artefact of the capture rather than a property of the site.

---

## 2. Method

```
sitemap            GET https://pebblrbooth.com.au/sitemap.xml -> every <loc>, host-relative
                   -> 32 paths
rendered           GET / and GET /shop/booths/photo/glam-booth-package; every host-relative
                   href in the returned markup (navigation, footer, in-page), excluding
                   assets, /_next/* and /api/*  -> 36 paths, 17 of them in no sitemap entry
source             src/app on the V1 storefront repository's default branch, enumerated from
                   the git tree at b32719e1 via the resolved repository probe (§ 5)
                   -> 5 further PUBLIC routes advertised by neither of the above
union              sitemap UNION rendered UNION source-only, deduplicated, sorted by path
                   -> 54
request            one unauthenticated GET per url, redirects followed (curl -L), serialised
                   at or below 1 request per second, descriptive user agent
user_agent         HeadKit-Migration-Inventory/1.0 (+phase-15.2a read-only pre-migration URL
                   inventory; contact store owner)
second pass        13 further GETs over the product pages only, to MEASURE the product-detail
                   marker count rather than borrow it (§ 4, rule 1)
```

Nothing credential-bearing or state-bearing was sent or recorded in either direction, and
no personal or order data was recorded. Per entry the capture kept only: the path, the
final status, the final url, the redirect count, the content type, the page title, and a
fingerprint of **counted** properties. Never a hash — a hash changes on every content edit
and is useless for parity within a week.

### The union is the finding

**22 of the 54 swept urls appear in NO sitemap entry.** Seventeen are linked from the live
navigation or footer, and **thirteen of those seventeen are WordPress editorial pages**
served by the `[...slug]` catch-all:

```
/backdrop-designs   /birthdays        /brand-activation-2   /corporate-events
/events             /extra-add-on-services                  /fundraisers
/graduations        /packages         /photo-booth-print-template
/venue-checklist    /wedding-photo-booth-adelaide           /white-labelling
```

The remaining four rendered-linked non-sitemap paths are `/account`, `/book-now`, `/news`
and `/quote`. The five source-only additions are `/search`, `/checkout`, `/checkout/error`,
`/account/forgot-password` and `/account/reset-password`.

This is the same class as the previous store's `/wholesale` — one path, in no sitemap,
linked from both navigation and footer, deleted from the new template — at **thirteen times
the scale**. A sitemap-only capture would have shipped a parity gate blind to all 22.

`/packages` deserves its own line: it is a WordPress **editorial page** returning 200, and it
is a _different live page_ from `/collections/packages`, the taxonomy archive that renders 8
product cards. Only the second is in the sitemap. Both are in this inventory.

---

## 3. Why it cannot be recaptured

Two independent one-way doors close over this input. After either one, the source of these
numbers no longer exists:

1. **The in-place WordPress theme upgrade.** The moment the live theme is upgraded, V1's
   pages no longer render as they do today, so the pages this capture fingerprinted cannot
   be reproduced by V1. (No fixed theme version is quoted here — phase 15.2a adopted the
   rule that every reference reads `integrations/wordpress/theme/style.css` at execution
   time, because the carried figure had already gone stale once.)
2. **The domain flip.** After 15.2b moves `pebblrbooth.com.au` to the V2 Vercel project, the
   hostname serves V2. There is no host left that answers as V1 did.

**Therefore this file, and the raw artifact it derives from, are the only surviving record
of what V1 served.** Do not delete either, and do not "refresh" this fixture from a V2 host
— that would make the gate assert that V2 matches itself.

### If the migration is restarted from before those points

Only meaningful while the source host still answers as V1. Re-run the capture and
re-derive; the procedure is `15.2a-06-PLAN.md` task 2, and the request policy it was
approved under is recorded in `artifacts/15.2a-06-repo-probe.md` § 1. If the source host no
longer answers as V1 the capture **cannot** be reproduced and no substitute exists. Say so;
do not synthesise one.

---

## 4. Derivation rules — raw capture → fixture

The raw capture records what V1 **does**. The fixture records what V2 **must do**. Every
rule below was applied mechanically to all 59 entries.

| Field                          | Rule                                                                                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `expected_final_path`          | the requested `path` itself for every entry. **No redirect is declared anywhere**, because the capture observed zero redirect hops across all 54 swept urls                                                               |
| `redirect_reason`              | mandatory on any entry whose `expected_final_path` differs from its `path`. There are none. A declared redirect without a reason makes the **whole fixture invalid** — the spec rejects it rather than skipping the entry |
| `expected_status`              | `200` for every entry                                                                                                                                                                                                     |
| `excluded` / `excluded_reason` | written explicitly on **every** entry, true or false. Five are `true` — see § 6                                                                                                                                           |
| `observed_on_source`           | the capture's own numbers, carried beside each expectation so a reader can re-judge the expectation instead of trusting the derivation. **Never itself asserted**                                                         |

Per-kind expectations (the kind vocabulary is the raw artifact's `kind_rule`):

| Kind         | Count | Expectation                                                                                                                                   |
| ------------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `product`    | 13    | `min_product_detail_markers: 0` + `canonical_expected: true` + a baseline note — see rule 1 below                                             |
| `category`   | 4     | `min_product_cards` = the observed card count (13 / 9 / 8 / 2)                                                                                |
| `listing`    | 3     | `min_product_cards` = the observed count (`/shop` 13, `/book-now` 9), or `0` + `baseline_zero_cards` where the observation was zero (`/news`) |
| `editorial`  | 26    | `min_body_text_length: 200`                                                                                                                   |
| `functional` | 13    | `status_only: true` (8 swept + 5 excluded)                                                                                                    |

Four derivation decisions are deliberate departures from the literal rule, each because the
literal rule would have asserted something false. They are named here rather than applied
silently.

### 1. 🔴 The product-detail marker floor is 0, and it was MEASURED, not borrowed

The sibling `dishee-url-inventory.json` carries `min_product_detail_markers: 2`.
Transplanting that number would have been the single most damaging thing this derivation
could do. A second capture pass over all 13 product pages measured the three markers the
gate actually looks for:

| Marker                                         | Present on Pebblr's V1 PDPs |
| ---------------------------------------------- | --------------------------- |
| `"@type":"Product"` JSON-LD                    | **0 of 13**                 |
| `"@type":"Offer"` / `"AggregateOffer"` JSON-LD | **0 of 13**                 |
| add-to-cart affordance text                    | **0 of 13**                 |
| `<link rel=canonical>`                         | **13 of 13**                |

The pages do emit `WebSite`, `Organization` and `BreadcrumbList` JSON-LD, so the regexes
were demonstrably firing; and the check was run in **both** the unescaped and the
RSC-escaped (`\"`) quote forms, so a zero is a real absence rather than a regex artefact.
The absent add-to-cart text is unsurprising in itself: this store hires photo booths, and
its call to action is an enquiry, not a cart add.

A floor of 2 would have failed **all 13 product cases** against a V2 storefront that is
strictly _better_ here — the textbook manufactured regression, and threat
`T-15.2a-06-06` in the plan's own register.

The floor is therefore `0`. A floor of `0` cannot fail on its own, so the case would assert
nothing were that all it carried — which is why `canonical_expected: true` is set beside it.
That assertion is real, it is backed by 13 of 13 observations, and it fails loudly if V2
drops or mis-points the canonical. **This is also a genuine finding for the migration, not
merely a fixture detail: V1 ships no product structured data at all, so adding it in V2 is
an improvement the gate will not object to and the merchant should be told about.**

### 2. A card floor is applied only where the capture observed at least one card

`/news` is a listing that V1 serves with **zero** product cards — it is the blog index.
Applying a floor of 1 would assert that V2 must render products on a page V1 renders none
on. It carries `min_product_cards: 0` plus `baseline_zero_cards: true` and a
`baseline_note`, so the weakness is visible in the data rather than hidden in a number, and
the spec's baseline branch asserts a 200-character body-text floor instead — which is what
stops that case from measuring nothing.

### 3. No card floor is written on editorial entries, even where cards were observed

Four editorial WordPress pages embed product cards — `/birthdays` (3), `/corporate-events`
(5), `/graduations` (6), `/wedding-photo-booth-adelaide` (2). A literal reading of "apply a
floor wherever at least one card was seen" would put `min_product_cards` on them. It is not
written, because `store-parity.spec.ts` registers the card case **only for `category` and
`listing` kinds** (`activeEntries.filter(e => e.kind === "category" || e.kind === "listing")`).
A floor on an editorial entry is an **inert field** — a number that looks like an assertion
and executes nothing. The counts are preserved in `observed_on_source` so a later plan can
reclassify those pages deliberately if it wants the assertion.

### 4. `min_body_text_length` is a flat conservative floor of 200, not a figure derived from `html_bytes`

`html_bytes` is downloaded markup — tags, inline script, streamed RSC payload — which is not
the same quantity as rendered text length and is not comparable between two storefront
implementations. A number derived from it would _look_ derived and _measure_ nothing. The
floor's job is to catch an empty shell or an error page. The capture separately recorded a
`visible_text_length` (tags stripped, entities unescaped, whitespace collapsed) precisely so
that "apply a body-text floor only where the capture saw substantive text" is **evidenced**
rather than inferred: the smallest editorial observation is **972** characters, comfortably
above the floor, so the floor is justified on all 26 rather than assumed.

### Two classification calls made on observation rather than on the route's name

- **`/book-now` is `listing`, not `functional`.** It renders **9** distinct PDP links. Its
  name suggests a form; the measurement says it is a listing, and the measurement wins. It
  therefore carries a real `min_product_cards: 9`.
- **`/search` stays `functional` despite rendering 13 cards.** V1's `/search` with an empty
  query renders the whole catalogue. Asserting that V2 must do the same would inherit a V1
  implementation detail as a migration obligation — a V2 search that shows an empty state
  for an empty query is a defensible product decision, not a regression. `status_only`.

---

## 5. The repository probe — it RESOLVED

`D-15.2a-14` timeboxed one read-only probe for Pebblr's storefront repository. It resolved.

| Field                     | Value                                                                       |
| ------------------------- | --------------------------------------------------------------------------- |
| Owner / repository        | `HeadKit-Commerce` / `tigerheart-studios-pebblr-booth-68e72bb0`             |
| Default branch, head read | `main`, `b32719e1a97452dc4b0fff6e530121bb38acfbd4`                          |
| Vercel project / team     | `prj_lqVGFogIbbfJ991EKvUlHNkb3WYw` / `headkit` (**not** `tigerheart`)       |
| Last push                 | `2026-02-12` — a **frozen per-store copy**, not a live fork of the template |

**What it changed about this enumeration:** five of the 54 swept urls (`/search`,
`/checkout`, `/checkout/error`, `/account/forgot-password`, `/account/reset-password`) exist
in this inventory for no other reason — nothing else advertises them. It also let two
route-safety questions be settled on evidence: rather than excluding `/checkout` and
`/account` on the theory that a `GET` might create a draft order or a session, their sources
were read, found to be `"use client"` components whose every data call sits inside a
`useEffect` or a submit handler, and swept. A `curl` `GET` executes no JavaScript. Both
returned 200. Excluding them "to be safe" would have shrunk the inventory for a reason
measurement disproves.

**The first probe answer looked like a miss and was not.** `GET /v9/projects/{id}` without a
`teamId` returned **HTTP 200 with every field `null`**. A probe that trusted that answer
would have recorded `MISS` on a 200 and closed the door on the source enumeration. Full
detail, including what this probe can and cannot distinguish between _absent_ and
_invisible-to-this-token_, is in `artifacts/15.2a-06-repo-probe.md` § 2.

**Consequence for SPEC-02** (the per-customer customization list, recorded BLOCKED since
2026-06-21): it **partially closes** for this store. There is now an authoritative route
inventory read from source rather than inferred. It is **not** fully closed — no
route-by-route comparison of Pebblr's components against the V2 starter was performed, and
`[...slug]`, `/book-now`, `/quote`, `/collections/*` and `/news` are route shapes the V2
starter does not carry by default. Those are recorded as **candidate parity gaps**, not as a
completed analysis.

---

## 6. Recorded pre-existing V1 behaviours — deliberately not "fixed"

Every item below is **pre-existing V1 behaviour**. The entire purpose of a baseline is that
V2 is not blamed for it. **None of these may be inherited as an acceptance criterion for the
new storefront.**

| Observation                                                                                                                                                    | Fixture treatment                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All 13 product pages emit ZERO product-detail markers** — no `Product` JSON-LD, no `Offer` JSON-LD, no add-to-cart text                                      | `min_product_detail_markers: 0` + `baseline_note`. Must not be inherited as an acceptance criterion; the canonical assertion carries the case instead                 |
| `/news` returns **200 with zero product cards** (it is the blog index)                                                                                         | `min_product_cards: 0` + `baseline_zero_cards: true` + `baseline_note`. Must not be inherited as an acceptance criterion                                              |
| `/account`, `/account/forgot-password`, `/account/reset-password`, `/checkout` and `/checkout/error` carry **no canonical link**                               | classified `functional`, so nothing asserts one. Must not be inherited as an acceptance criterion                                                                     |
| `/packages` (editorial WordPress page) and `/collections/packages` (taxonomy archive, 8 cards) are **different live pages**; only the second is in the sitemap | both carried as separate entries. Must not be inherited as an acceptance criterion that one redirects to the other                                                    |
| `/search` with an empty query renders the **whole catalogue** (13 cards)                                                                                       | `status_only`. Must not be inherited as an acceptance criterion                                                                                                       |
| Four editorial pages embed product cards (3 / 5 / 6 / 2)                                                                                                       | counts preserved in `observed_on_source`; no floor written, because the spec runs no card case on editorial entries. Must not be inherited as an acceptance criterion |

### Excluded entries

**Five**, and they are excluded for a reason the exclusion rule as originally written does
not cover — so the rule is widened here explicitly rather than stretched silently.

The sibling fixture's rule was _"`excluded` is set when the capture recorded a non-200 final
status."_ By that rule this fixture would exclude **nothing**: all 54 swept urls returned 200. The five entries carrying `excluded: true` are the auth-gated `(private)` account
routes — `/account/address`, `/account/change-password`, `/account/orders`,
`/account/profile`, `/account/wishlist`. Their **existence** is established from the source
tree; their **rendered behaviour** was deliberately not observed, because an unauthenticated
`GET` records only the login redirect (which asserts nothing about the page) and this plan
forbids an authenticated request of any kind.

They are carried rather than dropped so the inventory does not shrink quietly, and each
carries an `excluded_reason` — the spec rejects the whole fixture for an excluded entry with
no reason. The spec prints the skipped count on every run, including when it is zero.

Two further source-derived route shapes are recorded in the raw artifact's `not_swept` block
and are absent here because no concrete instance exists that is not tied to a real customer
order: `/account/orders/[orderId]` and `/checkout/success/[orderId]`. They were not
synthesised. The `/api/*` routes are also absent: `/api/revalidate` is a mutation endpoint
and was never requested, `/api/icon` is image generation, and `/api/checkout/confirm` has its
own dedicated case in the gate (`LEGACY_CONFIRM_PATH`).

---

## 7. The waiver

`playwright.config.ts:6-7` states the suite-wide rule: _"LOCAL-ONLY (HARD RULE): every
target is a localhost Docker endpoint. No staging/prod host may appear in this file."_ The
project's `.claude/CLAUDE.md` carries the same rule for build/dev work.

`store-parity.spec.ts` runs against a **remote** host, and the capture behind this fixture
read a live customer storefront. Both are explicit operator authorization, not an oversight.

**Where the authorization was granted.** `.claude/CLAUDE.md` § _STANDING AUTHORIZATION —
Phase 15.2a (Pebblr Booth rehearsal), granted 2026-08-16_, whose pre-authorized set opens
with _"Read-only inspection of anything."_ Its phase-specific form is
`15.2a-CONTEXT.md` § **D-15.2a-13** (the crawl conditions) and § **D-15.2a-15** (the read
authorization: _"unauthenticated public GETs against `pebblrbooth.com.au` … plus read-only
inspection of our own estates. No authenticated request to the customer's WordPress. No
write anywhere."_). The capture's shape — host, budget, rate ceiling and user agent — was
confirmed at plan 15.2a-06's own blocking checkpoint before the first request, and that
record, with the actual figures beside the budgeted ones, is
`.planning/phases/15.2-pebblr-booth-rehearsal/artifacts/15.2a-06-repo-probe.md`.

The waiver is bounded:

- **No host is hardcoded.** `E2E_BASE_URL` is required and has **no default** in this spec;
  unset makes the spec fail loudly rather than quietly sweep localhost. The customer
  hostname appears nowhere in the spec — only in this fixture's data.
- **Read-only by construction.** The spec issues `GET` only. It signs nothing in, submits no
  form, adds nothing to a cart, and performs no checkout action of any kind. The capture
  held the same discipline: 70 requests, all `GET`, none authenticated, none to an admin
  surface, zero `429`/`503` observed.
- **The transacting specs must never join this run.** Pebblr's Stripe account is **LIVE**,
  not test, and its WooCommerce database is the live order book. The safe invocation names
  this one file. `E2E_TEST_IGNORE` exists as defence in depth, but it is a **denylist** and a
  denylist fails open on any spec added after it was written — so naming the single file is
  the primary control, not the denylist.

---

## 8. Divergence note — what this data is, and what it is not

The raw artifact committed under `.planning/` and this fixture carry **public page metadata
only**: paths, final statuses, final urls, page titles, and counted structural properties.

They carry **no catalogue content** (no prices, no descriptions, no stock levels, no add-on
definitions), **no customer data** of any kind (no orders, no names, no addresses, no email
addresses), and **no credential** of any kind. No cookie, authorization header or credential
was sent in either direction, and none was recorded.

Stated precisely, per file, because "no customer data" is a claim and claims should be
checkable:

| File                                           | Free text it carries                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **This fixture** (`pebblr-url-inventory.json`) | **None that the store authored.** Every string-valued field across all 59 entries is one of six keys — `path`, `kind`, `expected_final_path`, `excluded_reason`, `baseline_note`, `why_not_captured` — and the last three are prose written by this plan. Paths are urls the store publishes. **No page titles appear in the fixture at all.** Every `observed_on_source` value is an integer or a boolean, except the `why_not_captured` note on the five excluded entries |
| **The raw artifact** (under `.planning/`)      | The same, plus the page `<title>` per entry — markup the store serves to every anonymous visitor and to every search engine. Titles are retained there, and only there, because the plan's per-entry field list explicitly permits them                                                                                                                                                                                                                                     |

The field enumeration above is machine-checkable:

```sh
jq -r '[.entries[] | to_entries[] | select(.value|type=="string") | .key]
     + [.entries[] | .expectations      | to_entries[] | select(.value|type=="string") | .key]
     + [.entries[] | .observed_on_source | to_entries[] | select(.value|type=="string") | .key]
     | unique | .[]' e2e/fixtures/pebblr-url-inventory.json
```

### The commit gate that does NOT apply, and why that is recorded rather than worked around

`scripts/scan-fixture-no-customer-text.sh` (plan 15.2a-04) was run against this fixture
**before** it was committed, as the ordering that makes it a gate rather than a report. It
returned **exit status 1**, `4 passed / 211 failed`.

That verdict is **not a finding about this file's content.** The scanner is the commit gate
for a _specific_ document — the add-on structural fingerprint emitted by
`scripts/replay-addon-definitions.py`. It requires top-level keys (`groups_by_type`,
`hazards`, `option_price_types`, …) that a url inventory does not have, and it pins the
`contract` subtree to a digest coupled to that emitter. Its failures here are schema-kind
mismatches, not unrecognised strings that happen to be customer text.

The discriminating control: the **same scanner, run against the already-committed sibling
`dishee-url-inventory.json`**, returns **exit status 1** with the same four passes and the
same failure classes. A gate that rejects a reviewed, shipped fixture from the previous
phase is measuring document kind, not content.

**The scanner was deliberately NOT widened to accept this schema.** Plan 15.2a-04's binding
note is explicit: those three instruments run _unchanged_ against Pebblr's real add-on
definitions in plan 15.2a-09, and any change after 15.2a-04 invalidates the sixteen red/green
observations that qualified them. Editing the scanner to make this fixture pass would have
traded a false green here for a broken control there.

The controls that **do** apply, and were run before the commit, are the field enumeration
above and the plan's own credential-shape scan — a regular expression over private-key
armour headers, live and test secret-key prefixes, webhook-signing-secret prefixes, database
and cache connection-string schemes, code-host token prefixes, and the two credential-bearing
request-header names — run over the fixture, this document and every phase artifact. **No
file matched.**

The pattern is described here rather than reproduced, deliberately. An earlier draft of this
paragraph pasted the alternation literally, and the very next run of the scan matched **this
document**, on its own description of the scan. A control that reports a hit on the file
explaining the control trains its readers to ignore it. The previous store's raw artifact
carries the same note for the same reason: name the property descriptively, so the artifact
does not itself trip the check. The exact expression lives in `15.2a-06-PLAN.md`'s acceptance
criteria, which is the right single place for it.

---

## 9. Running the gate

```sh
cd submodules/headkit-platform/apps/starter

# against the rehearsal host, before the flip
E2E_BASE_URL=https://pebblrbooth-rehearsal.headkit.app \
PARITY_URL_INVENTORY="$PWD/e2e/fixtures/pebblr-url-inventory.json" \
PARITY_TEMP_HOST=true \
bunx playwright test e2e/store-parity.spec.ts --project=chromium

# against the live host, after the flip — same fixture, same spec, comparable run
E2E_BASE_URL=https://pebblrbooth.com.au \
PARITY_URL_INVENTORY="$PWD/e2e/fixtures/pebblr-url-inventory.json" \
PARITY_TEMP_HOST=false \
bunx playwright test e2e/store-parity.spec.ts --project=chromium
```

| Variable               | Required                        | Meaning                                                                                                                                                                                                                                                                                                         |
| ---------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2E_BASE_URL`         | yes, no default                 | the origin under test                                                                                                                                                                                                                                                                                           |
| `PARITY_TEMP_HOST`     | yes, `true`/`false`, no default | whether this run targets a temporary host. `true` asserts the host is non-indexable and advertises no sitemap; `false` asserts the live posture. Neither branch skips                                                                                                                                           |
| `PARITY_URL_INVENTORY` | **yes, no default**             | path to the url inventory the run sweeps — **this file**, for Pebblr Booth. Several stores' inventories sit side by side in `e2e/fixtures/`, so there is no default: unset aborts in the before-all hook naming this variable, because a default would sweep one store's host against another store's inventory |

---

## 10. Cross-references

- `.planning/phases/15.2-pebblr-booth-rehearsal/artifacts/15.2a-06-url-inventory-raw.json` — the capture
- `.planning/phases/15.2-pebblr-booth-rehearsal/artifacts/15.2a-06-repo-probe.md` — the approved capture parameters, the repository probe, the measured request footprint
- `.planning/phases/15.2-pebblr-booth-rehearsal/artifacts/15.2a-01-premise-reverification.md` § A4 — how the apex host was established
- `.planning/phases/15.2-pebblr-booth-rehearsal/artifacts/15.2a-05-parity-parameterization.md` — how the gate became store-agnostic, and its abort messages
- `e2e/store-parity.spec.ts` — the consumer
- `e2e/fixtures/dishee-url-inventory.md` — the sibling this document's shape follows
