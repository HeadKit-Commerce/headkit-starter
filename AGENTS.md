# Agent guide — HeadKit starter storefront

Instructions for AI agents customising a customer storefront derived from this template.

## Customisation priority (follow in order)

1. **Dashboard branding** — colours, fonts, corner radius, icons. No code changes.
2. **`overrides/styles.css`** — cosmetic UI (layout, spacing, visibility, typography tweaks).
3. **`overrides/header-actions.tsx`** — extra header icons (phone, etc.) that CSS cannot inject.
4. **New routes / local components** — one-off pages or behaviour that cannot be expressed in CSS.
5. **Edit core components** — last resort; creates merge pain on starter upgrades.

## Do not edit for cosmetic work

Avoid changing these files when the goal is visual styling only:

- `components/headkit-ui/*` (except when adding a missing platform hook — prefer a monorepo PR)
- `app/globals.css` (platform defaults)
- `app/layout.tsx` (unless wiring new override assets)

Use **CSS hook classes** documented in [`overrides/README.md`](./overrides/README.md) instead. All hooks use the `headkit-*` prefix — e.g. `.headkit-nav`, `.headkit-home`, `.headkit-callout`, `.headkit-brand-carousel`, `.headkit-footer-payment-methods`.

## Typical tasks

| Task                                          | Where                                                                                           |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| Change nav link style                         | `overrides/styles.css` → `.headkit-nav`                                                         |
| Homepage section backgrounds                  | `overrides/styles.css` → `.headkit-home .headkit-*-carousel`                                    |
| Hide prices                                   | `overrides/styles.css` → `.price`, `[data-price]`                                               |
| Hide footer payment icons                     | `overrides/styles.css` → `.headkit-footer-payment-methods`                                      |
| Restyle callout / promo                       | `overrides/styles.css` → `.headkit-callout`                                                     |
| Add header phone / extra icon                 | `overrides/header-actions.tsx` → `HeaderActionExtras`                                           |
| Extra homepage tile or block                  | `overrides/home-slots.tsx`                                                                      |
| Script in `<head>` or block under main        | `overrides/layout-slots.tsx` (`BelowMain` stays a sibling of `{children}`)                      |
| PDP block beside bundles or under the buy box | `overrides/pdp-beside-bundles.tsx`, `overrides/pdp-buy-box-extras.tsx`                          |
| Two-column page or page video                 | `overrides/page-columns.tsx` (`renderPageMediaSegment`, `preparePageHtml`)                      |
| Shopify form beside page copy                 | `overrides/page-form-layout.tsx`                                                                |
| Journal or post video modal                   | `overrides/post-video-dialog.tsx`                                                               |
| Hide collection breadcrumbs                   | `overrides/collection-slots.tsx` (`showCollectionBreadcrumbs` returns false)                    |
| Homepage journal heading                      | `overrides/theme.json` `copy.homepageLatestNews`                                                |
| New landing page                              | `app/<route>/page.tsx` + declare the route in `sitemap.config.ts` (never edit `app/sitemap.ts`) |
| Change checkout logic                         | `lib/` + `app/checkout/` (behaviour, not cosmetics)                                             |

## Missing hook?

If you need a stable selector that does not exist, add a `headkit-*` class to the **platform starter** (`apps/starter` in the monorepo), not only the customer repo. Customer repos should consume hooks from upstream starter merges.

## Platform rules that survive a starter upgrade

### Canonical URL shape: NESTED wins, and one helper derives it

`/shop/<cat…>/<slug>` is the canonical product URL and `/collections/<parent>/<child>` the
canonical collection URL (captain's decision, 2026-08-22 — chosen to keep the V1 sites'
index equity, and deliberately NOT configurable). The flat `/products/<slug>` and
`/collections/<child>` shapes 308 onto them.

- **One derivation, never a second.** `lib/canonical-path.ts` (`productPath`,
  `productShopSegments`, `collectionPathFromSegments`) is the only place a product URL is
  built; a category's own path comes from `collectionPathFromCategory`
  (`components/headkit-ui/collection/utils.ts`), and the shared category-tree walk is
  `walkCategoryPaths` in `app/shop/shop-slug.ts`. The defect this closed was precisely a
  second copy: `app/sitemap.ts` advertised the nested shape while every link and the
  Product JSON-LD named the flat one, with both serving 200 and no redirect between them.
- **A product's canonical is its WooCommerce permalink** — not its first category, and not
  the page it was linked from. One value per product, so a product filed in several
  categories has the same canonical from every entry point.
- **Every signal must name the same string**: canonical / `og:url`, the 308 `Location`,
  every rendered link (nav, breadcrumbs, product cards, collection tiles, related
  products), Product + Breadcrumb JSON-LD, and the sitemap entry.
  `app/canonical-url-shape.test.tsx` asserts all of them together, in ONE test, for one
  fixture — keep it that way; five separate green tests are exactly the shape the bug
  already passed.
- **A route that redirects must sit above EVERY Suspense boundary — including the root
  layout's.** Under Cache Components a redirect thrown inside a boundary commits after the
  response, so the route answers 200 with a shell and redirects only on the client.
  `notFound()` fails the same way, so the sources that commit the response are enumerated
  once below, under "Setting a status code needs THREE conditions" — one of them was
  `app/layout.tsx` wrapping `{children}`, which is why nothing there may wrap `{children}`
  in one again. What decides is ANCESTRY, not presence: the narrow boundary `app/layout.tsx`
  still carries around `DynamicMetadataMarker` is a SIBLING of `{children}`, so it puts no
  page inside a boundary and no route's redirect below one. Measured on
  Next 16.3 with `cacheComponents: true`, one variable at a time: any of them present
  → 200; all absent → a real 308, prerendered and at runtime alike. `instant = true`
  makes no difference either way. Render the fallback from the page's own `<Suspense>`
  instead. The same trap is why the `/posts` → `/news` move lives in `next.config.ts`
  `redirects()`.
  A unit test cannot see any of this — calling the page function throws `NEXT_REDIRECT`
  under every arrangement — so `e2e/canonical-url-308.spec.ts` is what holds it, by asserting
  the status code over real HTTP against a built, running app. A root boundary also empties the
  prerendered shell: measured JS-off, the home page carried 0 visible characters with it and
  409 without. The same goes for a route-level boundary around a page's own cached content —
  see "Cached content renders OUTSIDE the boundary" below.

**One recorded exception to "every signal", and it is not small.** On a store using
WooCommerce's default `/product/` permalink base, `productCategorySegments` returns `[]` for
every product, so every PDP falls back to a crumb built from `product.categories` — and that
crumb names the FLAT `/collections/<slug>`, in the rendered link and in the Breadcrumb
JSON-LD alike. That is every PDP breadcrumb on that store class, not a rare degraded path.
It stays flat because the only way to nest it is a category-tree read
(`collectionPathResolver`), a `"use cache"` entry tagged `TAG.collections` — a tag WordPress
fires on every product-CATEGORY term edit — which would land on the PDP route entry and make
one category edit purge every PDP. The cost of the exception is one extra redirect hop; a
crawler following the crumb still reaches the canonical. Do not "fix" it back to the
resolver. Related and still open: the NESTED `/shop/[...slug]` route does still carry
`TAG.collections`, because its tree read is what decides category-vs-product — filed as
`260824-nested-pdp-catalogue-purge-tag` (P1), and it bites hardest on exactly the
nested-permalink stores this decision was made for.

**The trigger in that paragraph was wrong until 2026-09-17, and the correction changes the
frequency but not the decision.** It read "a tag WordPress fires on any PRODUCT or category
change", which would have made every stock save a store-wide PDP purge. `HK_TAG_COLLECTIONS`
is reachable from `headkit_resolve_endpoint_tags` only, which only `created_term` /
`edited_term` / `delete_term` on `product_cat` call; the product builder sends the SINGULAR
`headkit:collection:{slug}`, and only on a listing event. So the purge is per category-admin
edit, not per order. Pinned by name in `lib/wp-revalidation-events.test.ts` ("the plural index
tags are fired by TAXONOMY hooks only") so it cannot drift back. Whoever owns
`260824-nested-pdp-catalogue-purge-tag` should re-rank it against the real trigger — the
welding is unchanged, the rate is not.

**Category ancestry from the tree is not trustworthy; a permalink is.** Commerce builds the
category forest from WooCommerce's un-paginated, `hide_empty=true` list, so a child whose
parent fell outside that page is promoted to a ROOT
(`260822-commerce-category-list-orphan-promotion`, P1). `resolveShopPath` therefore treats an
unvalidatable ancestry chain as containment rather than a 404: alongside the reading its
validated chain supports, it offers the CONTAINMENT readings of the tail — last segment as
the product, last two as product + colourway — marked `ancestryValidated: false`. Those are
guesses, and what makes serving one safe is the route's check, not their position: the
resolved product's OWN permalink must reproduce the requested path exactly, which is what
keeps `/shop/junk/junk/{real}` at not-found. The `categorySegments` it returns cover only the
chain the tree confirmed, deliberately. Derive ancestry from the product's own permalink
(`productCategorySegments`), never from the requested segments.

The cart drawer and quote cart (G23) resolve their canonical `/shop/{cat…}/{slug}` link
client-side: the cart fragment selects a slug and no permalink, so
`components/headkit-ui/cart-item.tsx` and `components/quote/quote-cart-items.tsx` call
`resolveCartItemPath` (`lib/cart-item-path.ts`), which looks the product up by slug through
the same `getCachedProduct` cache the PDP routes read and derives `productPath` from its
`uri` — no SDK/schema change needed, since `ProductFields` already selects `uri`. Until that
resolves (or on a miss), both fall back to the flat `/products/{slug}` guess, which still
reaches the product via the 308.

That fallback window is why robots.txt is NOT what keeps the flat guess out of the crawled
graph on its own — there is no `/cart` route and no `/cart` disallow rule (the cart is a
drawer in the layout), and `/quote` is a real, crawlable, non-disallowed route. The mechanism
is the EMPTY CART: an anonymous crawler carries no cart session, so the cart has zero items
and no product href is emitted at all. `app/quote/page.tsx` short-circuits to `<QuoteEmpty />`;
the drawer additionally never server-renders, because `lazy-cart-drawer.tsx` loads it via
`dynamic(..., { ssr: false })`. Note the asymmetry: the quote summary IS server-rendered for a
request that carries a cart cookie, so it relies solely on the empty-cart short-circuit —
anything that server-renders a POPULATED cart or quote summary still puts the flat guess into
crawlable HTML for the brief window before the client resolves the canonical.

**Shopify Admin preview needs no exemption from the 308, and must not be given one.** A 308
drops the query string, so `?preview_key=` cannot survive one — yet the exemption that would
normally require is unavailable: reading `searchParams` in the default export is a dynamic
read above every Suspense boundary, which under Cache Components is a BUILD ERROR on a route
with `generateStaticParams`, and the boundary that would fix it is the one that turns the 308
back into a 200. Both levers are closed. Nothing is needed, because the redirect is gated on
`getCachedProduct` — the PUBLIC catalogue read — while preview exists precisely for products
that read cannot see. `GetProductBySlug`
(`services/commerce/internal/provider/shopify/catalog.go`) consults the Admin API only when
the Storefront query returned nothing, and the resolver maps that miss to a null product
rather than an error, so a draft never reaches the redirect at all and falls through to
`ProductPageContent`, which awaits `searchParams` INSIDE the boundary where it is legal. A
published product does still 308 with a key attached, and should: preview reveals nothing
extra about it. Do not add a `preview_key`-shaped exemption — a redirect anyone can opt out
of with a query parameter is not a redirect.

The corollary is the part that looks wrong and is not: `resolveShopifyPreviewProductPath`
(`lib/shopify-preview.ts`) returns the FLAT `/products/{handle}`, the losing shape, and must
keep doing so. The nested route verifies its candidate against `getCachedProduct` before
serving (`resolveShopProduct`), so a draft sent there answers notFound() — the flat route
is the only shape that can render one. Both entry points the HeadKit redirect theme rewrites
to (`integrations/shopify/theme/layout/theme.liquid`) land on it.

`app/products_preview` and `app/draft-product` are `export const instant = false`. They
render nothing and must read `searchParams` above every boundary, because the decision they
make IS the response; they previously borrowed the boundary `app/layout.tsx` wrapped
`{children}` in, and removing that (above) left them with none and failed the build outright.
Giving them a boundary instead would make them answer 200 + empty shell and redirect on the
client — the same defect the product and collection routes exist to close.

### A `redirects()` source in `next.config.ts` is also a blog base path

`RESERVED_POSTS_BASE` (`lib/posts-path.ts`) exists so a storefront route can never become the
WordPress Posts-page base. `next.config.ts` 308s `/posts` → `/news` unconditionally, and
`proxy.ts` 308s `/news` out to the store's own Posts slug whenever it is not `news` — so on a
store whose Posts page is literally `posts` the two rules are exact inverses and the whole blog
namespace answers ERR_TOO_MANY_REDIRECTS. That happened on a live rehearsal storefront.
`lib/posts-path.test.ts` asserts the whole class against the LIVE config, so adding a redirect
without reserving its first segment fails CI rather than a store. The second generator was the
CMS catch-all's own hard-coded `/news` target; it now derives from
`postsIndexPath(await getPostsBasePath())` and no-ops when the target equals the request.

### Setting a status code needs THREE conditions, and `instant` is not one of them

THIS SECTION IS THE ONE OWNER of the rule. Every gated route's docblock points here rather
than restating it; do not re-explain it in a route file.

`notFound()` and `permanentRedirect()` signal by THROWING, and a throw can only set the
status while the status line is unsent. Under Cache Components the response commits as 200 the
moment anything above the throw can render a fallback, after which Next injects
`<meta name="robots" content="noindex">` into the already-streaming body instead of sending a
404 — which is why an affected page carries TWO robots metas. So a route that must answer 404
or 308 has to satisfy all three of these, and satisfying two still yields 200:

1. **The decision is awaited in the route's own default export**, above every in-page
   `<Suspense>`. Keep the inner component's checks too: the `"use cache"` reads dedupe and the
   component stays correct on its own terms.
2. **No `loading.tsx` at the route OR at any ANCESTOR segment.** A `loading.tsx` is an implicit
   boundary around its own segment and everything nested below it, so `app/shop/loading.tsx`
   gated `/shop/[...slug]`. Equally, **`app/layout.tsx` must never wrap `{children}` in a
   `<Suspense>`** — that one commits the 200 for every route at once and makes an otherwise
   perfect fix completely inert. That is not hypothetical: a sibling storefront shipped this
   same route-wide hoist with two tests and still soft-404s in production today, because its
   root layout carries that boundary and neither test looked at the layout.
3. **`export async function generateStaticParams`, even with nothing to enumerate.** MEASURED
   on a Next 16.3 production build: a dynamic segment WITHOUT one is served from a fully
   postponed prerendered shell (`x-nextjs-prerender: 1`, `x-nextjs-postponed: 1`), so the shell
   commits the 200 before the page component runs. `/news/{missing}` and `/projects/{missing}`
   satisfied 1–2 and still answered 200; adding a placeholder-only `generateStaticParams` was
   the single change that made both 404. `app/client/[...slug]/page.tsx` is the minimal shape.

**`export const instant = false` is NOT a fourth condition, and this file used to say it was.**
The claim — that an instant route may not read `params` outside `<Suspense>`, which condition 1
needs — is false, and the correction is a one-variable MEASUREMENT on a Next 16.3 production
build against the local Docker stack, not a re-reading: with `app/brand/[...slug]/page.tsx`
flipped to `instant = true` and nothing else touched, `/brand/{missing}` still answered **404**,
with `x-nextjs-postponed: 1`, no `x-nextjs-prerender` and exactly ONE robots meta — identical
to the `instant = false` build captured before it, which answered 404 with the same three
signals. `next build` succeeded both ways, and the control (`/brand/acme`) stayed 200 both
ways. `app/products/[...slug]` is a second, independent counter-example already in the tree:
`instant = true`, `params` awaited above the boundary, a real measured 308.

What the export actually controls is NAVIGATION VALIDATION (Next 16.3's own bundled reference,
`next/dist/docs/01-app/03-api-reference/03-file-conventions/02-route-segment-config/instant.md`):
`true` opts the segment into
validation at the globally configured level — framework default `warning`, development only,
errors in the dev overlay, build unaffected — and `false` opts out, declaring the segment
"allowed to block when navigating to it" and exempting the route from the non-empty static
shell check at prerender time. **Keep `instant = false` on every gated route**: blocking on one
cached read before responding is exactly what these routes do, so the export is an accurate
declaration of their shape. Just never attribute a status code to it, and never reach for it as
the fix for a soft 404.

Two more rules follow from the gate rather than from the boundary, and both were shipped
soft-404s in their own right:

- **The gate's read must tell a MISS from a FAILURE.** `notFound()` is for a null the provider
  genuinely returned. A read that catches its own transport error into `null` — especially
  inside a `"use cache"` scope — hands the gate a miss it did not observe, and the gate then
  bakes a real 404 into the route cache for the whole `cacheLife`. `getPageData`
  (`app/[...slug]/page.tsx`, shared with `/wholesale`) did exactly that; it no longer catches,
  and `app/brand`, `app/collections` and `app/shop` state the same rule at their gates. The
  news/projects/client routes keep it with `unstable_rethrow` as the first statement of every
  recovering catch.
- **The build-time placeholder slug 404s AT the gate, not below it.** `generateStaticParams`
  needs ≥1 param (condition 3), so routes with nothing to enumerate return
  `__hk_static_placeholder`. It is never served from a prerender, so a runtime request for it
  is a junk URL: gating it with `if (slug[0] !== PLACEHOLDER) { …check… }` skips the gate and
  lets the inner component's `notFound()` fire below the boundary — the same soft 404, reachable
  by URL. Write `if (slug[0] === PLACEHOLDER) notFound();` above the boundary instead.

**EIGHT route families are gated:** `app/[...slug]`, `app/collections/[...slug]`,
`app/news/[...slug]`, `app/shop/[...slug]`, `app/brand/[...slug]`, `app/projects/[...slug]`,
`app/client/[...slug]` and the static `app/wholesale/page.tsx`. `app/not-found-status.test.ts`
holds the same list in executable form.

**`app/products/[...slug]` is deliberately NOT one of them.** The flat PDP still answers 200 for
a missing product, with the not-found UI and Next's own extra bare `noindex` in the body —
MEASURED on a local Next 16.3 production build. Gating it breaks the Shopify Admin
draft-preview flow, which another team owns: above the boundary a draft and a missing product
are the SAME null `getCachedProduct`, and the preview key that separates them lives in
`searchParams`, readable only below it. The gap is accepted and recorded in
`docs/tickets/products-flat-url-soft-404.md`; the exclusion is named in
`app/not-found-status.test.ts` and `e2e/not-found-status.spec.ts` so it cannot be mistaken for
an oversight and helpfully "fixed".

`app/not-found-status.test.ts` covers condition 3 by LOADING each route module and calling
`generateStaticParams` (with the SDK offline, which is the branch that matters), and conditions
1 and 2 structurally, because neither the gate's position relative to the boundary nor the
presence of a `loading.tsx`/root-layout boundary has any form observable at module scope. It
also pins `instant === false` per route — as the DECLARATION above, not as a status-code
condition. `e2e/not-found-status.spec.ts` asserts the actual status over HTTP, in BOTH
directions — a gate that 404s a route family's REAL pages is worse than the bug it replaced.
**No unit test that merely CALLS a page function can observe any of this**: it throws
`NEXT_HTTP_ERROR_FALLBACK` under every arrangement, so such a test is green under all of them.

**The cost is stated, not hidden.** Each gated route forfeits its static App Shell skeleton:
TTFB now waits on one `"use cache"` read (warm: memory) instead of painting a skeleton first.
Accepted — a 200 on every missing URL of every store is the larger cost. What the gate's read
resolves is then RENDERED, not re-read behind a boundary: the post and PDP routes hand it
straight to the page composition (next section), so the gate is also the page's data read.

### Cached content renders OUTSIDE the boundary, or it is hidden with JavaScript off

With JavaScript off a shopper (and any crawler that does not run scripts) sees only what
sits BEFORE the first `<div hidden id="S:…">` in the HTML. Under Cache Components TWO
things put content after it, and closing one without the other changes nothing:

- **A boundary whose subtree performs a request-time read** (`searchParams`, `cookies()`,
  `headers()`, `connection()`, an uncached read) is POSTPONED at prerender: the static file
  holds its fallback and not one byte of content. Without a boundary that read turns the
  whole route dynamic (`ƒ`, 0-byte shell) instead of failing the build — measured on a
  Next 16.3 production build, 2026-09-10, on `/shop/[...slug]`.
- **A COMPLETED boundary larger than React's `progressiveChunkSize` (12 800 bytes)** is
  outlined by Fizz (`flushSegment`, `isEligibleForOutlining` in
  `next/dist/compiled/react-dom`) into a hidden segment plus an inline `$RC` swap, even in a
  prerendered file where every read was cached. So a whole article or product inside ANY
  `<Suspense>` is invisible with JavaScript off. Measured the same day: the post route had
  no request-time read at all, yet 124 visible characters in the shell with its boundary
  and the entire article in `S:3`; 411 with the boundary removed and nothing hidden.

So a boundary belongs NEXT TO a request-time read and nowhere else; cached content renders
in the route itself. `app/news/[...slug]` has no boundary. Both PDP routes compose the
product the gate resolved through `ProductPageBody` outside any boundary; the flat
`/products/[...slug]` keeps ONE boundary, around `ProductPageContent`, and renders it only
when the public read returned null — the one branch that must await `searchParams` (the
Shopify preview key). `ProductStock` reads the same cached product entry (freshness is the
theme's `headkit:product:<slug>` purge), so it is inline too. The `/shop` category branch
keeps its boundary because `CollectionRoute` reads `searchParams` for its grid.

Measure, do not infer: `bun run scripts/static-shell-split.ts <.next/server/app/….html | url>`
prints the split, the visible characters on each side, and every hidden segment. The route
tests (`app/products/[...slug]/page.composition.test.tsx`, `app/shop/[...slug]/page.composition.test.tsx`,
`app/news/[...slug]/page.test.tsx`) pin the element tree that decides it. The same rule
reached one shared component: `ProductCarousel` used to wrap itself in an inert
`<Suspense fallback={null}>`, which put every related / upsell / editorial carousel's tiles
in the tail; it no longer does. React also outlines a boundary in the shell that contains
an eager `<img>` (`hasSuspenseyContent`), so a gallery or carousel that must be JS-off
visible gets no boundary of its own.

### The footer ships NO social links, and that is the fix

`app/layout.tsx` is a template file: a literal here reaches every merchant's footer, and a
template sync replaces a store's copy wholesale. It used to hard-code the VENDOR's own
Instagram/Discord/GitHub/LinkedIn/YouTube, so every storefront advertised them — and when one
store forked those lines to its own accounts, with a warning comment saying the fork would be
lost, the next sync silently republished the vendor's five on a live customer storefront.
`Footer` gates the whole Connect block on `hasSocialLinks`, so passing no prop makes the block
ABSENT, not empty. `app/layout-social-links.test.tsx` guards it as a chain — it RENDERS
`Footer` with and without links to prove the block is absent rather than empty, and it invokes
`RootLayout` to read the props it actually passes, because either half alone passes the bug. A
store adds its own by forking this one line.

Making that per-store DATA rather than a fork is an OPEN DECISION with no ticket behind it —
`store-social-links-platform-field` is a name to hold the decision by, not an id. The scope it
would span, and why leaving it open is safe, are stated once where the prop is absent, in
`app/layout.tsx`.

### A guard must state the domain it actually exercises — and where it stops

A test name, an assertion message and a "this proves X" comment are documentation, and the
whole point of a guard is that people stop looking once they see it. So a guard that claims
more than it checks is worse than no guard: it converts an unexamined gap into a believed
guarantee. When you write or edit one, say in the same breath what it covers AND what it does
not — which surfaces, which files, which store class, which layer.

The evidence for the bar is local and repeated. On the canonical-URL work alone: an
`existsSync` check stood in for "no `loading.tsx` exists" while proving only that a path was
absent from one directory; a sweep asserting "no route family emits the flat shape" twice
shipped green without covering the e2e specs at all (and CI's own `E2E_TEST_IGNORE` list —
`gift-card`, `forms-gravity`, `product-addons`, `store-parity` — hides four of those from every
run, more when no Stripe test key is configured); a wiring proof drove a leaf component with
hand-passed props while the prop-threading it existed to cover had none; and a cache-tag
guard was named for "the PDP route" while exercising one of the two routes that serve a PDP.
Same failure each time, in five costumes.

### Maintenance mode is a request-time Edge Config read, keyed per host

The storefront can be put dark and lifted in one Edge Config write with no redeploy
(cutover gate G6). Mechanism, keys, exemptions and the exact lift command live in
`MAINTENANCE.md`; the gate itself is `lib/maintenance.ts`, called first in `proxy.ts`.
Three things about it are not derivable from the code and get people into trouble:

- **The connection-string variable is `GLOBAL_CONFIG`, not `EDGE_CONFIG`.** Vercel renamed the
  product, and reading the old name leaves the gate taking the unarmed branch on every request
  forever — silently, with the storefront serving normally and nothing reporting it. The gate
  accepts both and resolves them in one place. The wider lesson, which cost a defect here and a
  no-op `revalidateTag` the same day: treat "the code says it should work" as unproven until a
  deployment says otherwise, and check the variable NAMES a platform actually injects rather than
  the ones its SDK documents.
- **The Edge Config store is TEAM-level and connected to every storefront project**, so the
  flag can never be a root boolean — that would be a fleet-wide kill switch. The key is
  derived from the request host (`maintenance_www_dishee_com_au`). Same reason the fail
  path is not a flat fail-closed: read failures only darken hosts already known to be dark,
  or one Edge Config incident takes the whole fleet down.
- **`consistentRead: true` is load-bearing**, not a default worth tidying away. Without it
  the SDK prefers a deploy-embedded snapshot of the config, and a gate whose entire purpose
  is a sharp `T+0` cannot read a snapshot.
- **It is a sign, not a fence.** It cannot stop checkouts; the fence is the WooCommerce
  gateway option write. Do not extend this gate into claiming otherwise.

Prove changes to it with `bun run test:smoke:maintenance` — a production build plus a live
flip. A unit test cannot make the claim that matters ("no redeploy").

### A content body that hands `processHomepageContent` `[]` re-reads every carousel product per request

`editorBlocks[].products` in a `GetContent` / homepage payload IS the product carousel's
data (the theme hydrates posts exactly as pages). `BlockEditor` falls back to an HTML scan
plus one product read per product only when a block carries no products — so a body that
passes `[]` instead of the payload's blocks turns a cached read into N paced origin reads
on every request: a six-carousel post measured 14 s → 1.0 s once the blocks were threaded
(`data/260908-bs-posts-page-latency/report.md`). `PostBody`, `CmsPageBody` and
`app/page.tsx` all thread them; a new surface must too. The fallback itself reads through
`getCachedProduct` (the PDP entry) — never a bare `headkit.products.get` — and the
shared Posts-page read is `getPostsLanding` in `lib/posts-base-path.ts`, not an inline
`sdk.posts.getLanding()`. `components/headkit-ui/post/post-body.test.tsx` asserts the
zero-read path; extend it rather than adding a mock of the decision.

### Request-time metadata costs the function resume, not cache lookups

Every route's `generateMetadata` is request-time by design (the `robots` meta reads the
request Host; `components/seo/dynamic-metadata-marker.tsx` is the hole that makes that
legal), and it reads `getBranding()` / `getBrandingAssets()` — two `"use cache: remote"`
entries. It is tempting to read the per-request tail on a CDN HIT as "two Runtime Cache
round trips" and to try to move those reads out of metadata. MEASURED, it is not:

- The prerender's postponed state carries the **Resume Data Cache** — every `use cache`
  entry the prerender read, `remote` ones included (`next/dist/server/resume-data-cache/`
  serialises all kinds; only `revalidate: 0` / short-`expire` entries are dropped). On a
  resume the platform POSTs that state back to the function (`x-nextjs-resume`,
  `base-server.js`) and `use cache` reads it BEFORE any cache handler. A counting
  `cacheHandlers` wrapper on a Next 16.3 production build (2026-09-10, PR #470) saw **0
  handler `get`s per warm request** on `/`, a CMS page, a post, a collection, a nested
  PDP, `/brand` and `/brand/{slug}` — for these two keys and for every other layout
  read. Both keys were present in every route's postponed state (decode a
  `.next/server/app/<route>.meta` `postponed` string: `<len>:<state><base64 deflate>`).
- Within one request the layout body reads the same keys, and `use cache` de-duplicates
  identical in-flight invocations (`pendingCacheInvocations` in `use-cache-wrapper.js`),
  so metadata could never add a lookup the body did not already pay.
- What the tail IS: one function invocation per HIT that re-renders the RSC tree from the
  postponed state and streams the holes — metadata, the marker, and the route's other
  holes (locally 4 on home/CMS/post, 5 on a collection, 6 on a PDP: product grids and
  carousels, `ProductStock`, the `searchParams` grid — counted BEFORE the post and PDP
  routes moved their cached content out of the boundary; see "Cached content renders
  OUTSIDE the boundary"). The only per-request cache lookups measured were outside
  metadata: the `searchParams`-keyed catalogue page on collection and brand routes, and
  the Stripe config read on a PDP.

So do not spend a change on taking `use cache` reads out of `generateMetadata`; it makes the
code harder to read and the tail no shorter. A `generateMetadata` result is also
indivisible — wholly prerenderable or wholly deferred (Next 16.3 bundled docs,
`generate-metadata.md`, "With Cache Components") — so a host-dependent `robots` key keeps
`<title>`, canonical and OG out of the static shell as well. Two shapes that would change
that were evaluated for PR #470 and REJECTED, and lever 2 of the scout report was closed as a
false premise (captain, 2026-09-10). Neither is a refactor; both alter what a non-indexable
host emits:

- **A rendered `<meta name="robots">` from the marker's hole, with `generateMetadata`
  static.** Puts `<title>`, canonical and OG into the shell but shortens nothing — the
  function still runs for the hole — and a rehearsal host then carries TWO robots metas,
  `index, follow` from the shell beside `noindex, nofollow` from the hole. Google applies
  the more restrictive rule, but `e2e/port-verify` deliberately reports a duplicate robots
  meta as a finding and `e2e/not-found-status.spec.ts` asserts at most one on a 404.
  Dropping the explicit `index, follow` instead leaves the live host with no robots meta.
- **An `X-Robots-Tag` header from `proxy.ts`, marker removed.** The only shape under which
  metadata needs no function, but the HTML robots tag stops being host-dependent — the
  header becomes the host signal — which is the ENG-868 / ENG-876 constraint, and the route
  still needs a function for its other holes. That is lever 11 of
  `data/260910-bikesociety-edge-cache-scout/report.md`: a separate decision for the
  captain, not something to fold into a metadata change.

### A WordPress mega-menu column is a `hidden` Custom Link, not a link

Themes have no column primitive, so a merchant expresses one as a destination-less
Custom Link (URI collapses to `/`) carrying the CSS class `hidden`, with the real
links as its children. Its label ("Column 1"…) is scaffolding: `lib/menu-columns.ts`
turns each container into ONE mega-menu column, gives every non-container sibling a
column of its own, drops a column that would be empty, and splices containers away at
every depth for flat surfaces (the mobile sheet). Never key this on the label or on
"URI is `/`" — the class is the merchant's own convention, and both alternatives were
measured wrong in `data/260910-bikesociety-full-gap-scout/report.md` §3.3.

The same WordPress menu usually still feeds the store's LIVE v1 site, which depends on
those containers for its layout, so deleting them in WordPress is not a fix available
before cutover. `lib/hide-empty-collections.ts` drops a container left with no
surviving children; without that the container outlives its own links (a container's
URI yields no collection slug, so nothing else can drop it).

**The menu query carries FOUR levels** (`NavigationMenuFields` in
`packages/sdk/src/operations/navigation.graphql`), because a container spends one of
them on layout. Commerce builds the tree to arbitrary depth from `parentId`, so depth
is an SDK-query question only. Both renderers recurse (`MegaMenuChild`,
`MobileMenuBranch`), so a deeper menu needs one more `children` in that fragment and no
component change.

**A dropdown parent renders as a `<button>`, never a link.** Radix's own trigger, no
`asChild`: a parent whose URI is `/` used to send a shopper home on the way to the
panel. A real destination is not lost — `MegaMenu`'s `viewAll` renders it as the
panel's first entry.

### The `breadcrumbs` prop on PDP/brand/collection headers used to be dead — collection now renders it

`ProductDetail`, `brand-header.tsx` and `CollectionHeader` all accept a `breadcrumbItems`/
`breadcrumbs` prop of `{ name, uri, current }[]`, and every route already computes it correctly
(PDP: `productCategorySegments` + `collectionPathFromCategory`; collection:
`buildBreadcrumbFromCategory` in `components/headkit-ui/collection/utils.ts`) and feeds the
identical data to `BreadcrumbJsonLD`. Before 2026-09-11 none of the three actually rendered a
visual trail — the prop was accepted and the doc comment said so ("kept for callers / agent
reference — not rendered on the storefront"), so only the JSON-LD `<script>` existed and no
shopper ever saw a breadcrumb. `CollectionHeader` now renders it (`components/ui/breadcrumb.tsx`'s
`Breadcrumb` — the one styled `Home > Shop > …`) above the `<h1>`, gated on
`breadcrumbs?.length > 0` so an omitted prop renders exactly as before. PDP and brand headers were
left alone — the 2026-09-11 decision scoped this to collection pages only (`plp-breadcrumb-owner`);
if a future task extends it there, reuse the same `Breadcrumb` component and the same gate, not a
new implementation.

### A cache tag's purge SEMANTIC follows its carriers, not its name

`/api/revalidate` no longer purges every allowlisted tag the same way. `invalidatesManyPages`
(`lib/cache-tags.ts`) splits the contract vocabulary in two and the route sends each half to a
different call:

- **wide** — whole catalogue (`headkit:products`, `headkit:catalog*`), whole route family
  (`headkit:route:*`), the brand-TERM tag (`headkit:brands`) and the five layout-chrome tags →
  `invalidateByTag` from `@vercel/functions`. The CDN keeps serving the existing copy and
  refreshes behind the request.
- **narrow** — the singular entity tags and the small type indexes → `revalidateTag(t,
{ expire: 0 })`, unchanged. A deletion, which is what the editor reloading the one page they
  just saved wants.

Three things about it are load-bearing and easy to undo by accident:

- **A tag is wide because of what CARRIES it.** `headkit:branding` names one CMS setting and
  sounds editor-facing, but `app/layout.tsx` awaits `getBranding()`, and under Cache Components
  a tag declared in a nested cached read propagates outward onto the awaiting route's entry — so
  it sits on every CDN entry in the storefront, a larger reach than `headkit:products`.
  `ROOT_LAYOUT_CHROME_TAGS` names the five, and `lib/root-layout-chrome-tags.test.ts` derives
  the set from `app/layout.tsx` and its carrier modules rather than trusting the list, so a
  SIXTH root-layout read fails CI until it is classified.
- **`revalidatePath` is an unconditional DELETE and beats an invalidate regardless of
  ordering.** WordPress sends paths beside tags, so purging a wide tag and then deleting the
  same page by path one line later makes the change inert while the log still says the
  invalidate fired. `tagCoveringPath` skips a path a tag in the SAME payload already covers —
  against the FILTERED tag list, because a dropped tag purged nothing and so covers nothing —
  and an uncovered path is always still purged.
- **The failure mode is biased towards slow, never wrong.** `invalidateByTag` resolves silently
  when the runtime handed the invocation no purge API, so `lib/vercel-purge.ts` probes the
  request-context symbol itself; with no purge API, or on a rejected call, the wide class falls
  back to deletion. That probe is also what keeps the whole path inert off Vercel. `purgeApi`,
  `purgeFallback`, `outcomes` and `skippedPaths` are in the log line and `purgeApi` in
  `GET /api/revalidate`, because "the purge landed" must be readable rather than assumed.

`lib/product-brand.ts` is the one read whose tag moved with this: the PDP brand logo subscribes
to `headkit:brands` (the term tag, fired only by a brand term create/edit/delete) and not
`headkit:brand:{slug}` (the product-SET tag, fired by every stock movement in the brand). That
pairing is why `headkit:brands` must stay wide — see the note in that file.

### The Payment step is a list of METHOD ROWS ending in exactly ONE action

Stripe's Payment Element is one row source among several. PayPal
(`components/checkout/steps/paypal-payment-option.tsx`) and WooCommerce's offline
gateways (`offline-payment-option.tsx`) contribute peer rows, and the step draws
**every** row before **any** action button — a single action slot at the end,
bound to whichever method is selected. Both are HOOKS rather than components
precisely because their row and their action are rendered in two different
places from one call, so the underlying PayPal iframe / button is still mounted
exactly once.

`lib/payment-method-selection.ts` is the only place the selection rule lives —
one selected row, one action, in all directions. It also owns the
`isStripeMethodSelected` guard, because Stripe's `onChange` fires for the
`collapse()` the step itself triggers. Stripe exposes no way to WRITE its
accordion's radio state, only `collapse()`, which is why picking a non-Stripe
method collapses the whole element.

Both gateways are dark unless configured, and that is load-bearing rather than
incidental: PayPal renders only when the store carries both
`NEXT_PUBLIC_PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET`
(`lib/paypal/config.ts` is the one place that rule lives), and an offline row
only when WooCommerce reports the gateway in `Cart.paymentMethods`. Both
decisions are made SERVER-side in `app/checkout/page.tsx`, so an unconfigured
store passes no prop at all — no component, no script, no bundle.
`app/checkout/paypal-absent.test.tsx` and `offline-gateway-absent.test.tsx` hold
that as a chain (config → predicate → render); each states where it stops.

An offline order is placed UNPAID, with no payment session and no `payment_data`
(`lib/offline-order.ts`). Never add a `payment_status: paid` key to tidy the
confirmation page — that tells a merchant an unreconciled order was paid for.
A PayPal order is the opposite: `lib/paypal/finalize.ts` is the ONE place a
capture becomes a WooCommerce order, and the capture id deliberately occupies
the `checkout_session_id` slot so the theme's existing atomic claim row dedupes
the browser against the webhook with no second mechanism. Its emitted key set is
a contract with `integrations/wordpress/theme/inc/headkit-payment.php`; the
`payment_status` it sends is advisory only — see
`docs/adr/005-payment-status-authority-by-provider.md`.

A merchant's offline-gateway title and instructions do not reach the storefront
today (`Cart.paymentMethods` is ids only), so they come from the server-only
`OFFLINE_PAYMENT_GATEWAY_DETAILS` env var as a stand-in.
`docs/tickets/offline-gateway-title-description.md` is the intended design;
`lib/offline-gateway-details.ts` is the one swap point when it lands.

### Stripe.js loads through the `/pure` entry, and only on demand

`@stripe/stripe-js`'s default entry injects the Stripe.js `<script>` as a side
effect of module import, so a single value-level import anywhere in the client
graph puts it on every route that reaches it — defeating the BNPL badge's own
`IntersectionObserver` gate and the store setting that hides the badge.
`lib/stripe-js-singleton.ts` imports `@stripe/stripe-js/pure` instead, which
does not, and `lib/stripe-js-singleton.test.ts` sweeps `app`, `components`,
`lib` and `hooks` to keep it that way. `import type` from the root entry is fine
and is used widely; that sweep is source text only, and says so.

Stripe's advanced fraud signals stay **on** — Stripe's own default, and what
every store gets today. A store opts out with
`NEXT_PUBLIC_STRIPE_ADVANCED_FRAUD_SIGNALS="false"`, applied once immediately
before the first `loadStripe`. The ordering is load-bearing (`setLoadParameters`
throws after `loadStripe` has run) and the setting is DOCUMENT-WIDE: both Stripe
entries share one DOM, so a client-side navigation from a product page carries
it into checkout. Stripe states the cost, which is why it is per-merchant and
never a platform default.

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this app.
Do not repeat what the codebase already shows; point to the authoritative file or command
instead. Prefer rewriting or pruning existing entries over appending new ones. When
updating this file, preserve this bar for all agents and keep entries concise.

## Monorepo context

This app lives at `apps/starter/` in the HeadKit platform monorepo. Customer repos are typically a flattened copy of this tree (no `apps/starter/` prefix).
