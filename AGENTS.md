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

| Task                          | Where                                                                                           |
| ----------------------------- | ----------------------------------------------------------------------------------------------- |
| Change nav link style         | `overrides/styles.css` → `.headkit-nav`                                                         |
| Homepage section backgrounds  | `overrides/styles.css` → `.headkit-home .headkit-*-carousel`                                    |
| Hide prices                   | `overrides/styles.css` → `.price`, `[data-price]`                                               |
| Hide footer payment icons     | `overrides/styles.css` → `.headkit-footer-payment-methods`                                      |
| Restyle callout / promo       | `overrides/styles.css` → `.headkit-callout`                                                     |
| Add header phone / extra icon | `overrides/header-actions.tsx` → `HeaderActionExtras`                                           |
| New landing page              | `app/<route>/page.tsx` + declare the route in `sitemap.config.ts` (never edit `app/sitemap.ts`) |
| Change checkout logic         | `lib/` + `app/checkout/` (behaviour, not cosmetics)                                             |

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
  response, so the route answers 200 with a shell and redirects only on the client. THREE
  separate things put a page inside one, and removing two of them still leaves a 200:
  an in-page `<Suspense>`, a route-level `loading.tsx` (an IMPLICIT boundary around the
  page component), and a boundary in an ANCESTOR layout — `app/layout.tsx` wrapping
  `{children}` did exactly that, which is why nothing there may wrap `{children}` in one
  again. What decides is ANCESTRY, not presence: the narrow boundary `app/layout.tsx` still
  carries around `DynamicMetadataMarker` is a SIBLING of `{children}`, so it puts no page
  inside a boundary and no route's redirect below one. Measured on
  Next 16.3 with `cacheComponents: true`, one variable at a time: any of the three present
  → 200; all three absent → a real 308, prerendered and at runtime alike. `instant = true`
  makes no difference either way. Render the fallback from the page's own `<Suspense>`
  instead. The same trap is why the `/posts` → `/news` move lives in `next.config.ts`
  `redirects()`.
  A unit test cannot see any of this — calling the page function throws `NEXT_REDIRECT`
  under all three — so `e2e/canonical-url-308.spec.ts` is what holds it, by asserting the
  status code over real HTTP against a built, running app. A root boundary also empties the
  prerendered shell: measured JS-off, the home page carried 0 visible characters with it and
  409 without.

**One recorded exception to "every signal", and it is not small.** On a store using
WooCommerce's default `/product/` permalink base, `productCategorySegments` returns `[]` for
every product, so every PDP falls back to a crumb built from `product.categories` — and that
crumb names the FLAT `/collections/<slug>`, in the rendered link and in the Breadcrumb
JSON-LD alike. That is every PDP breadcrumb on that store class, not a rare degraded path.
It stays flat because the only way to nest it is a category-tree read
(`collectionPathResolver`), a `"use cache"` entry tagged `TAG.collections` — a tag WordPress
fires on any product or category change — which would land on the PDP route entry and make
one product save purge every PDP. The cost of the exception is one extra redirect hop; a
crawler following the crumb still reaches the canonical. Do not "fix" it back to the
resolver. Related and still open: the NESTED `/shop/[...slug]` route does still carry
`TAG.collections`, because its tree read is what decides category-vs-product — filed as
`260824-nested-pdp-catalogue-purge-tag` (P1), and it bites hardest on exactly the
nested-permalink stores this decision was made for.

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

Known gap: the cart drawer and quote cart link `/products/<slug>` and rely on the 308,
because the cart fragment selects no permalink. robots.txt is NOT what keeps those links
out of the crawled graph — there is no `/cart` route and no `/cart` disallow rule (the cart
is a drawer in the layout), and `/quote` is a real, crawlable, non-disallowed route. The
mechanism is the EMPTY CART: an anonymous crawler carries no cart session, so the cart has
zero items and no product href is emitted. `app/quote/page.tsx` short-circuits to
`<QuoteEmpty />`; the drawer additionally never server-renders at all, because
`lazy-cart-drawer.tsx` loads it via `dynamic(..., { ssr: false })`. Note the asymmetry: the
quote summary IS server-rendered for a request that carries a cart cookie, so it relies
solely on the empty-cart short-circuit. Anything that server-renders a POPULATED cart or
quote summary therefore puts `/products/<slug>` links into crawlable HTML and must switch
to `productPath` first. Closing the gap properly needs an SDK change.

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
serving (`resolveProductParams`), so a draft sent there answers notFound() — the flat route
is the only shape that can render one. Both entry points the HeadKit redirect theme rewrites
to (`integrations/shopify/theme/layout/theme.liquid`) land on it.

`app/products_preview` and `app/draft-product` are `export const instant = false`. They
render nothing and must read `searchParams` above every boundary, because the decision they
make IS the response; they previously borrowed the boundary `app/layout.tsx` wrapped
`{children}` in, and removing that (above) left them with none and failed the build outright.
Giving them a boundary instead would make them answer 200 + empty shell and redirect on the
client — the same defect the product and collection routes exist to close.

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
`gift-card`, `forms-gravity`, `product-addons` — hides three of those from every run, more
when no Stripe test key is configured); a wiring proof drove a leaf component with
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

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this app.
Do not repeat what the codebase already shows; point to the authoritative file or command
instead. Prefer rewriting or pruning existing entries over appending new ones. When
updating this file, preserve this bar for all agents and keep entries concise.

## Monorepo context

This app lives at `apps/starter/` in the HeadKit platform monorepo. Customer repos are typically a flattened copy of this tree (no `apps/starter/` prefix).
