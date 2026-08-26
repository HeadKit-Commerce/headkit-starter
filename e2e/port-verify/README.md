# port-verify — prove a storefront port changed nothing it was not meant to change

A capture-and-compare harness. `capture.ts` records what every URL in a store's
inventory **is**; `compare.ts` diffs two capture directories into a report
ordered for triage.

## Why a screenshot diff would not do

The starter work about to be ported into the customer storefronts:

- makes the nested URL canonical and returns `308` from the flat one (`938fa521`, PR #330)
- gates the HTML `robots` meta on the request host rather than `VERCEL_ENV` (PR #323/#324)
- rewrites Product and Breadcrumb JSON-LD, internal link `href`s and the sitemap to match

Every one of those renders **pixel-identical**. A screenshot-only comparison
reports "no change" and the port ships an indexing regression on a live store
under a green light. A false green is worse than no check at all, because it is
believed.

So the harness records what a page _is_, not only what it looks like — and the
report puts those signals **above** the pixels, always.

## Running it

**Use one host, at two points in time.** Deploy the current code to a stable preview alias and
capture `before`; deploy the ported code to the **same alias** and capture `after`. Nothing
unverified is ever promoted to production, and — because both captures share a host — none of the
cross-origin caveats below apply.

```bash
# 1. deploy the CURRENT code to a stable preview alias, then capture it
bun run e2e/port-verify/capture.ts \
  --base-url https://<alias> \
  --plan e2e/port-verify/plans/<store>.json \
  --out .port-verify/before --label before

# 2. …port, and deploy the ported code to the SAME alias…

# 3. capture it again — same --base-url
bun run e2e/port-verify/capture.ts \
  --base-url https://<alias> \
  --plan e2e/port-verify/plans/<store>.json \
  --out .port-verify/after --label after

# 4. compare
bun run e2e/port-verify/compare.ts \
  --before .port-verify/before --after .port-verify/after \
  --out .port-verify/report
```

Capturing the two runs against **different** origins is supported, and is the right tool for a
cutover check — rehearsal host before, live domain after. It is a fallback rather than the default
because **a cross-origin pair cannot give a determinate verdict on an origin-bearing signal**: every
canonical, `og:url`, JSON-LD `url`/`@id`, href and final URL that matches across two hosts is
reported as _not determinable_ rather than as a match, and the exit code is 1. Three things follow
from a cross-origin pair that a same-host pair never has to think about; all three are spelled out
in [Comparing two different origins](#comparing-two-different-origins) and all three are restated in
the report itself whenever the origins differ.

`--base-url`, `--plan` and `--out` are **required and undefaulted**, for the
same reason `store-parity.spec.ts` defaults none of its three variables: a
default would silently decide which store a run is about.

| capture flag        | default | what it is for                                                 |
| ------------------- | ------- | -------------------------------------------------------------- |
| `--concurrency`     | `2`     | pages fetched at once                                          |
| `--min-interval-ms` | `250`   | floor between request starts; raise it against a customer host |
| `--timeout-ms`      | `45000` | per-request HTTP timeout                                       |
| `--freeze-clock`    | off     | pin the page clock (see _Determinism_ below)                   |
| `--overwrite`       | off     | permit replacing a **completed** capture directory (see below) |

| compare flag        | default | what it is for                                           |
| ------------------- | ------- | -------------------------------------------------------- |
| `--pixel-threshold` | `2`     | per-channel tolerance, 0–255                             |
| `--fail-on`         | `any`   | `any` \| `signal` \| `none` — what makes the exit code 1 |

`--fail-on any` means any **signal, capture, undetermined or pixel** row. **Cache and prerender
headers are excluded from the exit code**: the harness records them without asserting them —
`x-vercel-cache` flips between `HIT` and `MISS` on its own schedule — so a code that carried them
would be red on every healthy real-host pair, and an exit code that is red on every healthy run
stops carrying information. The rows are still printed in full; they simply stop deciding the
verdict. An **undetermined** row is the opposite case and makes the code 1 under both `any` and
`signal`: a comparison that could not verify a field has not passed.

Every numeric flag is **validated at parse time**, not coerced. `--pixel-threshold abc`
would otherwise become `NaN`, `delta > NaN` is always false, and the sweep would report zero
screenshot differences with the words "threshold of NaN" as its only trace. An unparseable or
out-of-range value names the flag and exits `2` instead of running a check that cannot fail.

**An undeclared or mis-shaped flag is an error too**, in both CLIs. A flag that is silently
ignored is the same failure as one that cannot fail: the run reports success under settings
nobody chose. `--min-interval 2000` (for `--min-interval-ms`) would have left the 250 ms floor
in place and swept a live customer storefront eight times faster than asked; `--freeze-clock true`
would have left clock pinning off. Both now exit `2` naming the flag, as does a switch given a
value or a value flag written bare.

### `--out` is cleared on every run, and a completed capture is protected

`capture.ts` clears `--out` before writing. Four cases, and the split between them is the point:

| `--out` holds                                              | what happens                                            |
| ---------------------------------------------------------- | ------------------------------------------------------- |
| nothing, or an empty directory                             | created, no flag                                        |
| `capture.json` — a capture that **ran to completion**      | **refused** unless `--overwrite` is passed              |
| `entries/` or `screens/` but no `capture.json` — a partial | cleared freely, no flag, and the run says it did so     |
| anything else                                              | **refused**, and `--overwrite` does **not** override it |

`capture.json` is written last, after every target has been swept, so its presence already means
"this ran to completion" — no new marker was invented for this.

A **before** capture is a one-shot artifact: once the port has landed the pre-port state does not
exist anywhere to be recaptured, and the whole value of this instrument is the comparison against
it. But `--overwrite` must never become a reflex — an operator who has to pass it on every ordinary
retry ends up with it in shell history, sitting on the command that destroys the baseline too.
Clearing a partial capture with no ceremony is what keeps the flag rare enough to still mean
something.

`compare.ts` stays permissive and needs no flag. That asymmetry is deliberate: a report is fully
reproducible from the two captures it was built from, so nothing there is irreplaceable.

Artifacts land under `.port-verify/`, which is git-ignored.

## The fixture list is data, and it already exists

The harness reads the same `*-url-inventory.json` files `store-parity.spec.ts`
reads — `e2e/fixtures/pebblr-url-inventory.json` (59 entries) and
`e2e/fixtures/dishee-url-inventory.json` (50 entries), each with a provenance
`.md` beside it. Same `entries` array, same `path`/`kind`/`excluded` contract.
The two tools therefore cannot drift onto two different ideas of what a store's
URLs are, and a fresh per-store list slots in with no code change.

Point `--plan` at an inventory directly, or at an **overlay** — a second file
naming an inventory plus the things that belong to the _comparison_ rather than
to the URL list:

```jsonc
{
  "name": "<store> — port verification",
  "inventory": "../../fixtures/<store>-url-inventory.json",
  "add": [{ "path": "/products/<slug>", "kind": "product" }],
  "signals_only": ["/products/**"],
  "masks": [{ "selector": ".stock-count", "why": "…" }],
  "normalize": [
    {
      "field": "links",
      "pattern": "sid=\\w+",
      "replace": "sid={s}",
      "why": "…",
    },
  ],
  "blocked_hosts": ["js.stripe.com"],
}
```

`masks` and `blocked_hosts` **extend** their built-in lists rather than replacing them, so a
plan declares only what is store-specific. The three default masks (`iframe`, `video`,
`[data-port-verify-mask]`) and the payment-host list apply to every plan; re-declaring a default
mask selector adopts the plan's `why` but **merges** its `paths` with the default's — and an empty
`paths` means everywhere — so a default's coverage can never be narrowed. There is no way to remove
or narrow a default: a mask is a declared blind spot, so adding is the safe direction. Both shipped
store plans now declare one mask of their own (the related-products carousel, below) and still
inherit all three defaults plus the whole payment-host list; `lib/plan.test.ts` asserts exactly
that, because a plan whose list REPLACED the defaults would pass a "the carousel is masked" check
while having silently un-masked every iframe on the store. The report's blind-spot table lists every
effective one.

A `normalize` rule takes an optional `paths` too, with the same empty-means-everywhere default —
but it travels in the opposite direction. A mask's `paths` can only ADD a blind spot; a
normalisation's can only SHRINK one, because there are no default rules for it to narrow. It exists
because a rule wide enough to absorb one page family's volatile value is usually far too wide for
the rest of the store: the rule that stops a product page's related-products carousel reporting its
per-render pick would, run store-wide, collapse every product grid on `/shop`, `/search` and each
collection to a single token, and a port that dropped half the catalogue off those pages would then
compare clean.

`add` exists because the inventories were captured from the **V1** sites and
list only the URLs those sites served. The shapes whose _status_ is the thing
under test — the flat product URL that becomes a `308`, a guaranteed-missing URL
in each route family — are absent from them by construction. They are declared
in the overlay rather than edited into a captured inventory whose provenance
document states exactly what it swept and when.

`signals_only` marks a URL as status-and-headers only, with no screenshot and no
no-JavaScript pass. That is the right shape for the flat product URL: its
"after" is a redirect, so there is no page to pair pixels against.

**Pairing is by URL.** The measurement behind this harness found that every URL
captured before the port still resolves after it, the flat product URL excepted.
Entity keying would have bought nothing and cost complexity.

## What is recorded per URL

|                                                                    |                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| status + full redirect chain                                       | every hop's status and `Location`, walked one hop at a time, kept **absolute** and origin-normalised with the query string intact — a `308` to another host must not read like one to `/shop/x`. A `308` and a `200` carrying a client-side redirect are recorded **separately** — that difference was a real defect in this codebase |
| `<link rel="canonical">`, `<meta property="og:url">`               | read from the live DOM                                                                                                                                                                                                                                                                                                                |
| `<meta name="robots">` **and** the robots.txt verdict for the path | two different signals; `app/robots.ts` can flip one without the other. The verdict and sitemap membership are recorded **twice** — once for the path the plan asked for, once for where the chain ended (see below)                                                                                                                   |
| JSON-LD                                                            | every `@type`, `url` and `@id`, at any depth — `offers.url` and breadcrumb `item.@id` included                                                                                                                                                                                                                                        |
| sitemap membership                                                 | a captured signal, never the source of the capture list (both rehearsal hosts currently publish an empty sitemap); recorded for the requested path **and** the final path                                                                                                                                                             |
| internal links                                                     | every rendered `href`, normalised to site-relative paths, deduplicated and sorted                                                                                                                                                                                                                                                     |
| cache/prerender headers                                            | `x-nextjs-cache`, `x-vercel-cache`, `x-nextjs-prerender`, `x-matched-path`, `cache-control`, and whether `age` was present                                                                                                                                                                                                            |
| screenshots                                                        | desktop `1280×900` and mobile `390×844`, full page, each held back until two consecutive frames came out pixel-identical — and each carrying `frameStable`, the gate's verdict on whether that ever happened                                                                                                                          |
| **the no-JavaScript pass**                                         | for every full-mode URL: the prerendered shell's text length and link count, whether it carries `<noscript>`, a screenshot taken with scripting disabled, and its **ink ratio**                                                                                                                                                       |

**Ink ratio** is the fraction of pixels differing from the page's dominant
background colour. It is what makes an empty prerendered shell legible without
anyone opening a PNG: a root-layout `<Suspense>` boundary in this codebase
produced a shell that looked perfect with JavaScript on and was blank with it
off, and the comparison names that as `ink ratio (JS off): 0.31 → 0.004`.

**robots.txt and sitemap membership are keyed on BOTH paths.** The flat product
URL is the reason: it returns `200` before the port and `308` after it. Keyed on
the destination alone, the "before" run measures `/products/x` and the "after"
run measures `/shop/…/x`, so a port that drops `/products/x` from the sitemap or
adds `Disallow: /products/` — the sitemap-and-robots half of the delta under
test — would read as unchanged on both. Keyed on the requested path alone, the
destination's own verdict is never seen. So both are captured and both are named
in the report (`robots.txt verdict (requested path)` /
`(final path)`); the final-path rows appear only when the URL actually
redirected, so a URL that did not is never reported twice. A capture that failed
outright fills both from the requested path — the one path it still knows — so a
good run and a failed run cannot disagree about what `requested` means.

**Attribute order never decides whether a signal is seen.** The raw-HTML
extractors match the tag first and parse its attributes second. Fusing the two
into one regular expression silently required `rel` before `href` and `name`
before `content`, and on a signals-only entry there is no live-DOM fallback — so
a canonical the regex could not see recorded as absent in _both_ runs and diffed
to nothing.

**Every copy of a tag is recorded, not the first.** A page is supposed to carry
one canonical and one robots meta. Measured against a real rehearsal
storefront, that is not safe: its not-found page emits two robots metas —
`noindex` and `noindex, nofollow` — and their document order _flips between two
responses served from the same cache entry_. Reading "the first one" made the
capture non-reproducible for a reason that had nothing to do with any port. The
copies are deduplicated, sorted and joined with `|`, which is stable and which
also surfaces the duplicate as the finding it is.

One JSON file per URL under `entries/`, so the capture is diffable with ordinary
tools as well as with `compare.ts`.

## The controls against placing an order — and the two gaps in them

The Dishee rehearsal storefront is armed with **live** Stripe against a real
merchant account. A completed order there is a real charge on real money. "The
fixture list contains no checkout submit" is not a control — the fixture list is
data. These are the controls, and they are in `lib/safety.ts`:

1. **Non-GET is refused at the browser.** Every request the page issues passes
   through a route interceptor; anything that is not a `GET` is aborted before
   it leaves the process and recorded on the capture record. A form submit, a
   `fetch('POST')` — none of them reach the network.
2. **Payment hosts are refused at the route handler.** No payment provider
   script loads on any page this harness opens by a request the PAGE issues, so
   there is no payment element to confirm — but see the two declared gaps below
   before treating that as absolute.

   **Controls 1 and 2 are blind to a service worker.** Both are enforced by one
   `context.route()` handler, and Playwright's `context.route()` does not
   intercept requests issued by a service worker. `capture.ts` does not pass
   `serviceWorkers: "block"` to `newContext()`, so that option holds its default
   of `'allow'`. For a target that registers a service worker: a non-GET the
   worker issues is neither aborted nor recorded, and a blocked payment host is
   reachable through it. **An empty `blockedRequests` list is not proof that
   nothing mutating was attempted** — it proves only that nothing mutating
   reached the route handler. GATE 0 does not cover this, because the test
   server registers no service worker, so the behavioural proof below passes
   with the hole standing. **This gap is ACCEPTED, not pending.**
   `260825-port-verify-service-worker-blind-guard` proposed
   `serviceWorkers: "block"` plus a GATE 0 service-worker fixture and was CLOSED
   AS DECLINED — service workers stay enabled, because blocking them changes
   what a worker-backed page renders into a capture, on an instrument whose
   whole job is fidelity comparison. No code fix is coming, so the protection is
   a PER-TARGET MEASUREMENT and the acceptance is conditional on it: **reopen
   this before pointing the harness at any store whose service-worker status has
   not been measured.**
   Measured read-only 2026-08-25: none of `dishee-rehearsal.headkit.app`,
   `www.dishee.com.au` or `pebblrbooth.com.au` registers a service worker in its
   served homepage HTML. That check greps the homepage for `serviceWorker` /
   `sw.js` / `workbox`, so a registration inside a bundled JS chunk or on a
   non-homepage route would not have appeared — evidence the hole does not bite
   on today's targets, not proof that it cannot.

   **A blocked-host GET is aborted without being recorded.** The asymmetry is
   deliberate to state and not deliberate by design: a non-GET is recorded and
   then aborted, while a `GET` to a host in `DEFAULT_BLOCKED_HOSTS` is aborted
   and pushed nowhere. So the report cannot show whether a payment provider was
   contacted at all, and a V1-versus-V2 difference in payment-script loading
   does NOT appear as a difference — both runs abort identically and both record
   nothing, so a real port defect of that shape renders as a match. Tracked as
   `260825-port-verify-blocked-get-not-recorded`, which is **still OPEN and
   undecided** — unlike the service-worker gap above, which is closed as
   accepted. Do not read the two as one status. They are also different
   defects: that one is about requests ESCAPING the guard, this one is about
   requests the guard CAUGHT and DISCARDED.

3. **The harness has no interaction surface.** It navigates, reads and
   photographs. It never clicks, types, presses, submits, drags or uploads.

   Two different things hold this, and they are not interchangeable. **GATE 0 is
   the evidence**: a synthetic page that POSTs on load must be captured with the
   attempt recorded and the server must log zero non-GET requests — behaviour,
   executed end to end. The check in `lib/safety.test.ts` is a **source-text
   tripwire**, not the proof: it substring-matches this directory's `.ts` files
   and executes nothing, so it cannot see indirection and it fires on a dead or
   commented-out occurrence. It is there as defence in depth for what GATE 0
   cannot cover — someone extending this harness later adding `page.fill()` to a
   capture pass, on a page that never POSTs.

A plan's `blocked_hosts` **extends** the payment-host list and can never replace
it. A plan that added one unrelated host used to un-block Stripe, PayPal and
Google/Apple Pay for that store; fixture data must not be able to switch off a
safety control.

Capturing the checkout _page_ is in scope and is done. Any action that could
place an order is not.

**Never run the inherited `e2e/` suite against a customer host.** Many of its
specs place real orders or mutate store state — `store-parity.spec.ts`'s docblock
enumerates them — and `E2E_TEST_IGNORE` is a denylist that fails open on any spec
added later. Name the single file you mean.

## Determinism, and the blind spots that buy it

The first acceptance gate is that two runs against an unchanged target diff to
**nothing**. A report that cries wolf trains its readers to skim, and then the
one real finding is skimmed too. What gets it there:

- fixed viewports and a fixed user agent — never a Playwright device preset,
  whose values move between releases and would silently repaint every screenshot
- `animations: "disabled"`, plus a stylesheet that zeroes every animation,
  transition and caret and forces `scroll-behavior: auto`
- a seeded `Math.random`
- fixed locale, timezone and colour scheme
- settle before shooting: `load`, network idle, **then the streamed dynamic
  holes having landed**, then fonts loaded, then **every `<img>` painted** — asked
  for as `complete && naturalWidth > 0`, then as the terminal `complete` a broken
  image can actually satisfy, then a `decode()` sweep, all on small budgets
  because `networkidle` has already waited out the requests — then a
  synchronous scroll to the bottom and back to force lazy content, then network
  idle, a second landed-holes check for whatever the scroll opened, and a second
  image check — the one that matters, because the scroll is what STARTED every
  lazy image below the fold
- **a two-frame stability gate before every screenshot**: shoot, wait 250ms,
  shoot again, and keep the frame only once two consecutive frames are
  pixel-identical (see below)
- a per-channel pixel threshold of 2 — Chromium's text rasterisation is not
  bit-identical between processes, and an exact comparison reports thousands of
  one-unit pixels on a page nobody touched
- an absolute epsilon of `0.001` on the no-JavaScript **ink ratio**, for the same
  reason: it is derived from the same rasterisation, and comparing it by exact
  float equality gave a signal-tier metric no tolerance at all. The number is
  headroom over the **measurement quantum** — `inkRatio` rounds to four decimals,
  so `0.0001` — and explicitly _not_ a multiple of measured jitter, because
  measured jitter across 63 ink comparisons (two real-host self-diff pairs plus
  one synthetic pair, desktop, mobile and no-JS) was exactly `0.000000`. The
  smallest healthy ink ratio observed was `0.0745`, so a blank prerendered shell
  clears the epsilon by ~74x. The row stays in the **signal** tier — ink is the
  one signal-tier metric that names an empty shell — and a sub-epsilon move is
  still visible anyway, because the no-JS screenshot is pixel-compared
  independently of it
- masks, applied narrowly and listed in the report

One thing on this list is **not** buyable in the browser at all. The
related-products carousel on a product page picks its items at RENDER time, on
the server, before the bytes are sent: two ISR cache entries for the same
unchanged URL carry different products, while three back-to-back requests for
one URL are byte-stable. It is per-REGENERATION, not per-request, so the seeded
`Math.random`, `--freeze-clock`, the settle path and every mask act too late to
touch it. Both shipped store plans declare it as a blind spot — a mask on the
item tiles, plus (dishee only) a `links` normalisation for which products were
picked — with the measurement in each `why`. What stays asserted: the section
and its heading are still compared pixel-for-pixel, the item count is still
compared as the prerendered link count, and a carousel the port removes, empties
or resizes still reports. Masking the container wholesale would have traded a
noisy true positive for a silent false negative. Evidence:
`260825-port-verify-before-snapshots` report §5.

The pebblr plan declares a second blind spot of exactly this shape and for
exactly this reason: the nine-tile "Gallery image N" grid on
`/photo-booth-print-template` shows a different nine-image sample of the same
pool from one render to the next. Measured read-only before it was declared —
three `curl`s of the page returned byte-identical HTML carrying the same nine
filenames, and four browser loads rendered that same nine — so this too is
decided on the server per ISR entry, not in the browser per load. The six NAMED
"Layout N" template tiles beside it are deterministic and are **not** masked. Its
`why` also records the trap that made the original diagnosis read as a per-load
shuffle: `rawTextLength` and `rawLinkCount` are computed with `<script>`
stripped, so they cannot see a pick that travels in the RSC flight payload, and
"the served bytes were identical" was really "the two metrics that can see the
bytes are blind to this field".

**`load` + network idle is not a settled page under Cache Components.** A
Suspense boundary the server could not resolve ships as
`<!--$?--><template id="B:n"></template>`; its content arrives later inside
`<div hidden id="S:n">`, and a script then MOVES it into place — so for a window
measured in tens of milliseconds the content exists twice, once where it belongs
and once in a container that measures 0px. The settle path therefore waits for
both halves of the condition `AGENTS.md` specifies: no `template` placeholder is
left AND nothing is still sitting in the hidden staging container. Waiting on
the second alone is vacuously satisfied before the content ever arrives.
Best-effort like every other wait here — on a non-React target neither selector
matches and it returns on the first poll.

GATE 1 cannot catch a settle that returns early on its own: both runs miss the
content equally and the diff is empty, which is a false green. So the synthetic
storefront serves `/streamed`, whose payload sits in the `<template>` — NOT in
the `<div hidden>`, which is in the document tree and whose links a capture
finds whether or not the hole landed — and GATE 1 asserts the landed link
positively beside the empty diff.

**The waits are milestones; the gate is the property.** Two rounds of
milestone-based waits each missed something new — round 1 missed the streamed
dynamic holes, and the fix for those still missed lazy images and late client
renders (`260825-port-verify-before-snapshots` report §5a/§5b/§5d: a footer logo
and a breadcrumb label PRESENT in one pass and ABSENT in the other at identical
coordinates, on a different URL each pass). Waiting for "the things we thought
of" is structurally open-ended, so a stability gate sits after them: shoot, wait
250ms, shoot again, and proceed only when two consecutive frames are
pixel-identical. It asserts the property the self-diff is actually testing — the
frame has stopped moving — rather than a proxy for it, which is why it also
covers the late render nobody has named yet. On a page that was already still it
costs exactly one extra frame.

It is **bounded and loud**, never patient. A gate that retried until the frame
settled would hang on any page carrying an animation `FREEZE_CSS` does not
reach, and a wedged capture produces no record at all — strictly worse than a
visible give-up. So it shoots at most four frames, keeps the last one, writes the
give-up to stderr as it happens, and records `frameStable: false` on the
screenshot; the comparison then prints a `pixel`-tier row directly above the
pixel row it qualifies, saying that a difference there may be the capture rather
than the page. `frameStable` is absent from captures written before the gate
existed, and absent means UNKNOWN — readers test for `=== false`, never for
falsiness, or every pre-gate screenshot reads as a give-up that never happened.

**Nothing in the settle path may depend on an in-page timer.** An earlier
version installed Playwright's fake clock; fake timers also freeze `setTimeout`,
so the scroll-through awaited a callback that could never fire and the capture
wedged with no output at all. Clock pinning is therefore opt-in
(`--freeze-clock`) and implemented as a `Date` override that advances one
millisecond per read — every deadline loop still terminates, and every rendered
date is identical between runs. Turn it on for a target that renders a date or a
countdown.

Every browser call is fenced by a 90-second deadline. A capture that wedges is
worse than one that fails: it produces no record, no error and no report.

### A URL that failed to capture is never a clean comparison

A blown deadline or a `502` produces deterministic error text, so a URL that
failed _identically_ on both sweeps used to yield no rows at all — every other
field being null on both sides — and the report said "No differences" over a URL
nothing was ever learned about. That is the believed false green, reached by the
harness failing rather than the storefront changing. The comparison now counts
capture failures per run and in **both**, prints the both-run count in the
verdict table with the URLs named above the differences, and emits a signal-tier
row per URL so `--fail-on signal` and the exit code carry it.

### Masks hide content, not layout

A mask paints a region; it does not stop that region's content from changing the
page's layout. A volatile element that also _resizes_ will still move everything
below it. Give such an element a stable box in the storefront, or mask its
container.

The screenshot masks cannot reach the prerendered-text metrics either, because
those are computed on the raw bytes. Declare a `normalize` rule with
`"field": "all"` for genuinely volatile text.

### A pair that is not comparable cannot read as clean

`HARNESS_VERSION` is bumped whenever the capture procedure changes in a way that invalidates
pairs — a viewport, the settle timing, the user agent, how masks are injected. `compare.ts`
**reads** it, along with clock pinning, viewports, normalise rules, masks and blocked hosts. Any
mismatch is the first group in the report, counts as a signal difference, and is called out above
the verdict: a difference below it may describe the harness rather than the storefront, and an
absence of differences proves nothing. `loadRun`'s schema-version gate cannot see any of these,
because none of them changes the record shape.

**The base URL is deliberately not one of them.** A cross-origin pair is a supported comparison,
so a differing origin is a **note** in the report header rather than a verdict on whether the
comparison can be believed. What that note does _not_ say is that such a pair simply compares
clean — see below.

### Comparing two different origins

Three independent things happen, and the report keeps them apart because they need different
treatment.

**1. Baked-origin URLs — normalised away.** This storefront does not build its absolute URLs from
the request host: `storefrontUrl(path, storeSettings.domain)` and `resolveJsonLdSiteUrl()` bake the
runtime **store domain** into the canonical, `og:url` and every JSON-LD `url`/`@id`. Capture-time
normalisation only knows the origin it was pointed at, so on a rehearsal or preview host that baked
origin survives literally while the production run's copy became `{origin}` — a row on every
full-mode URL for a reason that says nothing about the storefront. So the **comparison** rewrites
_both_ runs' origins to `{origin}` before comparing anything: canonical, `og:url`, JSON-LD
`url`/`@id`, rendered hrefs, every redirect hop and its `Location`, the final URL, and
blocked-request URLs. (Hrefs need one extra step. `normalizeHref` reduces a **same-origin** href to
a bare path, so an absolute internal href is `/shop` in the run that swept the store domain and
`{origin}/shop` in the other; the comparison reduces the token form back to a path so the two line
up.) A third-party origin is still left intact and still reported — a canonical that starts naming
somebody else's host is the regression this harness exists to catch.

**2. What that reconciliation cannot then verify — reported as `undetermined`.** Reconciling is not
verifying. Once both origins collapse onto one token, `{origin}` no longer names the same real
origin on the two sides, and capture has already erased which origin it replaced. So a canonical
that **matches** may be two different origins agreeing only in shape — and an origin regression (a
canonical built from the request host or the build-time `NEXT_PUBLIC_FRONTEND_URL` instead of the
runtime store domain — the class AGENTS.md files under _"Shopper-facing URLs: the runtime store
domain, never the baked env"_) is indistinguishable from agreement. Reporting that as a match would
be the false green this instrument exists to prevent, so every origin-bearing field that matches
with the token present is reported in its own **Fields this pair cannot determine** group: counted
separately from the signal differences, and making the exit code 1 under both `--fail-on any` and
`--fail-on signal`. A field that genuinely **differs** is determinable and keeps its ordinary group.

This is several rows per URL, and it is verbose on purpose. It is the honest cost of a mode that
cannot verify these fields, and it is why the same-host workflow is the headline: **a cross-origin
pair cannot produce a determinate verdict on an origin-bearing signal, and a same-host pair can.**

**3. Host-gated indexing — real, and left in.** `meta name=robots` and the `robots.txt verdict`
**will** differ on a cross-origin pair, and those rows are true. Indexing derives from the request
host (`isIndexableCurrentHost` in `lib/indexing-decision.ts`, and `app/robots.ts`), failing closed
for any host that is not the store's configured domain — so a preview or rehearsal host genuinely
is `noindex`. That is PR #323 working as designed, and one of the very changes being ported. These
rows are never suppressed, exempted or downgraded: a harness that hid a robots difference to make a
report look tidy would be the false green this whole instrument exists to prevent.

On a cutover check — rehearsal host before, live domain after — cause 1 is pure noise and cause 3 is
exactly the signal being checked. Normalising the first is what keeps the third readable instead of
drowned, and cause 2 is the standing reminder that the origin half of that report was never proved
either way.

The blind-spot lists below the differences name **which run** they describe, and print both when
the two runs declared different ones — a before run captured with different normalise rules was
previously presented under the after run's list.

### A screenshot that will not decode costs one row, not the report

`decodePng` throws by name on a truncated, interlaced, 16-bit or non-PNG file. That decode used
to sit outside any `try`, in a loop that runs _before_ the report is written into a directory
already cleared — so one bad PNG destroyed every signal difference the run had found and exited
`1` with nothing on disk. It is now caught per pair and reported as a pixel row naming the file
and the error. Exit code `2` still means what it says: the comparison itself could not run, which
one unreadable screenshot is not.

### Every blind spot is printed

Masks, normalisation rules, blocked hosts, URLs the plan skipped and the
structural limits are all rendered into `report.md` — not only into a source
comment. A green report that does not say what it agreed not to look at
overstates itself.

## The acceptance gates

```bash
bun run port-verify:gate      # or: bun run e2e/port-verify/gate.ts
```

Runs all three gates against `testserver/` — a deterministic synthetic
storefront — in seconds, with no network and no Docker stack. The two acceptance
gates (GATE 0, the safety gate, is described after them):

1. **Self-diff.** Capture the same unchanged target twice; require an empty
   diff. This is the gate that decides whether the harness is worth anything.
2. **Planted signal.** Change one signal on one page — the
   `<link rel="canonical">` href, and nothing else: not `og:url`, not the
   JSON-LD, not one pixel — and require the harness to report exactly that,
   named, with **zero** pixel differences. This is the gate the naive
   screenshot harness fails.

Measured on 2026-08-25:

```
GATE 0 PASS — 2 POST attempt(s) refused at the browser and recorded on the capture;
              the server logged 0 non-GET requests across both runs.
GATE 1 PASS — empty diff across two captures of an unchanged target.
GATE 2 PASS — every reported difference is the planted canonical flip, named as one,
              on 3 URL(s): /legacy/kettle, /products/copper-kettle,
              /shop/kitchen/kettles/copper-kettle
  link rel=canonical: {origin}/shop/kitchen/kettles/copper-kettle
                   -> {origin}/products/copper-kettle
  zero pixel differences: the change is invisible to a screenshot, which is the point.
```

Three URLs, not one: the nested URL, the flat URL that `308`s onto it, and a
legacy URL that reaches it by client-side navigation all resolve to the changed
page. A harness that reported the flip only on the URL that was typed would miss
it on every store whose fixtures list the flat shape.

**One host, two points in time — the gate models real use.** GATE 2 plants its
canonical flip by switching the variant on the RUNNING server (`setVariant("b")`
in `testserver/server.ts`), not by restarting on a fresh ephemeral port. That is
the headline workflow above, and it is what a real port does: the same origin
serves different content before and after. Restarting handed the comparison two
different origins — `http://127.0.0.1:A` against `http://127.0.0.1:B` — which
made every origin-bearing field [undeterminable](#comparing-two-different-origins)
and buried the planted flip under 58 rows describing the fixture rather than the
storefront. That second origin was an artifact of how the gate spun up servers
and was never part of what it tests.

Nothing about the assertion moved, and nothing is suppressed: GATE 2 still
requires the planted flip to be the ONLY reported difference, on those three
URLs, with zero pixel differences, and still fails if it is not. A genuine origin
change on a real pair still produces `undetermined` rows exactly as designed —
`lib/diff.test.ts` and `lib/report.test.ts` exercise that path directly, and
`lib/diff.test.ts` also asserts that an undetermined row makes the exit code 1
under both `--fail-on any` and `--fail-on signal`.

A third gate — **GATE 0** — runs before them: `/order-attempt` on the synthetic
storefront carries a POST form and fires a POST from script the moment it loads.
The capture must record the attempt and the server must never see it. That check
exists here precisely because it cannot be run against the storefront whose
Stripe is live. It has already earned its place: it is what caught the route
handlers being registered in an order that let a document-level POST past the
guard.

### And against a real storefront

The synthetic target cannot show whether the settling survives a real Next
application — fonts, streaming, lazy images, a CDN. So the self-diff was also
run twice against the deployed pebblr rehearsal host, GET only, one request at a
time, over eight URLs spanning home, `/shop`, a depth-1 and a depth-2
collection, a nested PDP, an editorial page, the flat PDP (signals-only) and a
guaranteed-missing URL:

```
port-verify compare: 8 URLs compared
  signal differences: 0
  cache/prerender header differences: 0
  screenshot differences: 0
```

Zero — including full-page desktop, mobile and no-JavaScript screenshots.

The first attempt was **not** clean, and the one row it produced is worth
recording: `/this-page-does-not-exist  meta name=robots: noindex → noindex,
nofollow`. That store's not-found page emits two robots metas and their document
order flips between responses served from the same cache entry. The harness was
reading the first one. That is what "getting to a clean self-diff is most of the
work" means in practice — and the fix (record every copy, sorted) turned an
unstable field into a finding.

## Why here

`store-parity.spec.ts` is the spine this extends: store-agnostic by
construction, driven by required undefaulted environment variables, and the one
spec in the suite carrying an explicit operator waiver to run against a remote
host. This harness follows all three of those properties, reads the same
fixtures, and shares the directory.

Where the two instruments part company is the request guard, and it matters:
THIS harness installs one (`installGetOnlyGuard`, with the service-worker and
blocked-GET limits declared above), and **`store-parity.spec.ts` installs none
at all** — its `page.goto` passes load the storefront with JavaScript on, and the
root layout's hydration-time `getCartAction()` is a `"use server"` call
dispatched as a POST that nothing aborts or records. Do not point that spec at a
live customer storefront until `260825-store-parity-no-request-guard` lands; its
docblock has the full account.

It is a pair of CLIs rather than a Playwright spec because it is an _instrument
that emits artifacts_, not a pass/fail suite — and because a capture invoked
through `playwright test` is one stray argument away from sweeping the whole
suite, many specs of which transact, against a live merchant.
