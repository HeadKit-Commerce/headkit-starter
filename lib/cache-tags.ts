/**
 * Cache-tag contract — the single source of truth for every cache tag the
 * storefront subscribes to (D2 taxonomy, CACHE-01).
 *
 * Two independently-maintained tag namespaces with no shared vocabulary is the
 * documented ROOT CAUSE of the silent under-invalidation bug (`00-GROUNDING.md`
 * §2): WordPress fires tag strings the starter never listens to, and vice-versa,
 * so menu / homepage / carousel / new / sale / category edits invalidate
 * nothing. This module reconciles the drift:
 *
 *  - `TAG`      — the canonical `headkit:{type}[:{id}]` builder map. Every
 *                 realigned component (09.5-03/04/05) imports these builders so
 *                 no inline tag literal can drift again. The WP PHP mirror
 *                 (09.5-06) reproduces these strings verbatim.
 *  - `bridgeTags` — remaps EVERY legacy tag WP fires today (`00-GROUNDING.md`
 *                 §2) to its contract equivalent. Idempotent: a WP that already
 *                 emits contract tags (after 09.5-06) passes through unchanged.
 *  - `isKnownTag` — a strict allowlist over the contract vocabulary. The route
 *                 (09.5-02) applies `.filter(isKnownTag)` so an unknown /
 *                 attacker-influenced tag can never reach `revalidateTag`
 *                 (threat T-09.5-01). A RAW legacy tag is only valid AFTER
 *                 passing through `bridgeTags` — so `bridgeTags` completeness is
 *                 measurable as the route's `dropped` count (threat T-09.5-02).
 *  - `invalidatesManyPages` — blast-radius classification over that same
 *                 vocabulary, so the route can INVALIDATE a whole-catalogue or
 *                 layout-chrome tag while still DELETING a narrow editor-facing
 *                 one. Lives here because the tag set is owned here.
 *  - `tagCoveringPath` — whether a tag in the same payload already covers a
 *                 path, so the route can skip a `revalidatePath` delete that
 *                 would otherwise defeat that invalidation.
 *
 * Convention: `headkit:{type}[:{id}]`, lowercase prefix, `id` = stable slug/id.
 * Cache Components limits: 128 tags/call, 256 chars each.
 *
 * Pure module — no I/O, no `process.env`, no `console`, no side effects.
 */

/**
 * The menu locations WordPress can fire a menu edit for. Used to fan the
 * location-less legacy `headkit:menu` tag out to every subscribed location.
 */
export const KNOWN_MENU_LOCATIONS = [
  "PRIMARY",
  "SECONDARY",
  "PRE_HEADER",
  "FOOTER",
  "FOOTER_2",
  "FOOTER_3",
  "FOOTER_4",
  "FOOTER_POLICY",
] as const;

/**
 * Canonical cache-tag builder map (D2). Every builder returns the exact contract
 * string; explicit `: string` return types are required by the repo tsconfig.
 */
export const TAG = {
  // entity — fired on that entity's edit
  product: (slug: string): string => `headkit:product:${slug}`,
  collection: (slug: string): string => `headkit:collection:${slug}`, // SINGULAR (fixes plural/singular drift)
  brand: (slug: string): string => `headkit:brand:${slug}`,
  post: (slug: string): string => `headkit:post:${slug}`,
  project: (slug: string): string => `headkit:project:${slug}`,
  client: (slug: string): string => `headkit:client:${slug}`,
  page: (slug: string): string => `headkit:page:${slug}`,
  // type/index — `products` on a listing event (create / publish / unpublish /
  // delete / term change); `collections` and `brands` on a term edit of
  // product_cat / product_brand and never on a product save
  // (docs/cache-revalidation-contract.md)
  products: "headkit:products",
  collections: "headkit:collections",
  brands: "headkit:brands",
  posts: "headkit:posts",
  projects: "headkit:projects",
  clients: "headkit:clients",
  pages: "headkit:pages",
  // grid internal key (already used; keep) — remote, life minutes, self-healing
  catalogCat: (slug: string): string => `headkit:catalog:cat:${slug}`,
  // layout chrome — NEVER a route/page tag (Bike Society incident)
  menu: (loc: string): string => `headkit:menu:${loc}`,
  footer: "headkit:footer",
  branding: "headkit:branding",
  /** Store email marketing (Klaviyo / HubSpot) connection status — layout chrome. */
  emailMarketing: "headkit:email-marketing",
  // route / synthetic-landing (filter pages have no collection entity)
  route: (r: "home" | "shop" | "sale" | "new" | "featured"): string =>
    `headkit:route:${r}`,
  // global
  catalog: "headkit:catalog",
  settings: "headkit:settings",
} as const;

/**
 * Raw legacy tags WordPress fires today that are NOT valid contract tags — they
 * only become revalidatable AFTER `bridgeTags` remaps them. Kept as an explicit
 * deny-set so `isKnownTag` rejects a raw legacy tag even when it would otherwise
 * shadow a contract prefix (e.g. `headkit:page:/` under the `headkit:page:`
 * family). Enumerated from `00-GROUNDING.md` §2 + `RECOMMENDATION.md` §151.
 */
const LEGACY_RAW_TAGS: ReadonlySet<string> = new Set([
  "headkit:menu",
  "headkit:page:/",
  "headkit:page:shop",
  "headkit:carousel",
  "headkit:new-in",
  "headkit:sale",
]);

/** Prefix of the plural legacy collections tag (`headkit:collections:{slug}`). */
const LEGACY_COLLECTIONS_PLURAL_PREFIX = "headkit:collections:";

/**
 * Remap a single legacy tag to its contract equivalent(s). The special cases
 * are matched BEFORE any generic passthrough so `headkit:page:/` never falls
 * through to the generic `headkit:page:{slug}` family. A tag already in contract
 * form (or an unknown tag) returns unchanged — the caller drops unknowns via
 * `isKnownTag`, never here.
 */
function bridgeOne(raw: string): string[] {
  // 1→many chrome fan-out: legacy `headkit:menu` carries no location.
  if (raw === "headkit:menu") {
    return [...KNOWN_MENU_LOCATIONS.map((loc) => TAG.menu(loc)), TAG.footer];
  }
  // Synthetic landings / route escape-hatches.
  if (raw === "headkit:page:/") return [TAG.route("home")];
  if (raw === "headkit:page:shop") return [TAG.route("shop")];
  if (raw === "headkit:carousel") {
    // Legacy carousel tag: home hero + CMS pages that embed hero carousels
    // (slides are hydrated into page editorBlocks at fetch time).
    return [TAG.route("home"), TAG.pages];
  }
  if (raw === "headkit:new-in") return [TAG.route("new")];
  if (raw === "headkit:sale") return [TAG.route("sale")];
  // Plural collections (dynamic slug) → singular collection. Must precede the
  // generic passthrough and must NOT catch the bare `headkit:collections` index.
  if (raw.startsWith(LEGACY_COLLECTIONS_PLURAL_PREFIX)) {
    const slug = raw.slice(LEGACY_COLLECTIONS_PLURAL_PREFIX.length);
    return [TAG.collection(slug)];
  }
  // Already contract form (product/brand/post/page:{slug}, collections index,
  // brands, posts, and anything WP emits after 09.5-06) — pass through.
  return [raw];
}

/**
 * Remap every legacy string WordPress fires today to its contract equivalent,
 * flatten the 1→many expansions (menu, carousel), and de-duplicate. Idempotent
 * for tags already in canonical form.
 */
export function bridgeTags(raw: string[]): string[] {
  const out: string[] = [];
  for (const tag of raw) {
    for (const mapped of bridgeOne(tag)) {
      if (!out.includes(mapped)) out.push(mapped);
    }
  }
  return out;
}

/** Fixed contract tags (globals / type-indexes / chrome) that match exactly. */
const KNOWN_EXACT_TAGS: ReadonlySet<string> = new Set([
  TAG.products,
  TAG.collections,
  TAG.brands,
  TAG.posts,
  TAG.projects,
  TAG.clients,
  TAG.pages,
  TAG.footer,
  TAG.branding,
  TAG.emailMarketing,
  TAG.catalog,
  TAG.settings,
]);

/**
 * Contract prefix families. A tag matches only when it carries a non-empty id
 * after the prefix. `headkit:catalog:cat:` is listed before `headkit:catalog:`
 * for readability; both resolve to true, so order is not load-bearing here.
 */
const KNOWN_PREFIXES: readonly string[] = [
  "headkit:product:",
  "headkit:collection:",
  "headkit:brand:",
  "headkit:post:",
  "headkit:project:",
  "headkit:client:",
  "headkit:page:",
  "headkit:menu:",
  "headkit:route:",
  "headkit:catalog:cat:",
  "headkit:catalog:",
];

/**
 * True only for tags in the contract vocabulary — the fixed exact strings and
 * the prefix families. A RAW legacy tag (`headkit:page:/`, `headkit:menu`,
 * plural `headkit:collections:{slug}`) is FALSE so it counts as revalidatable
 * only after passing through `bridgeTags`. This is the strict allowlist the
 * route filters on before calling `revalidateTag` (threat T-09.5-01).
 */
export function isKnownTag(tag: string): boolean {
  if (LEGACY_RAW_TAGS.has(tag)) return false;
  if (KNOWN_EXACT_TAGS.has(tag)) return true;
  for (const prefix of KNOWN_PREFIXES) {
    if (tag.startsWith(prefix) && tag.length > prefix.length) return true;
  }
  return false;
}

/**
 * Tags whose blast radius is the WHOLE catalogue, matched exactly. A purge of
 * one of these reaches thousands of CDN entries at once, because every PDP and
 * every listing page's cached HTML carries them transitively (`TAG.products`
 * via `getCachedProduct`, `TAG.catalog` / `TAG.route(...)` via the grid reads).
 *
 * `TAG.brands` is the one member that is not a catalogue tag. It is the brand
 * TERM tag, and it is site-reaching because `getCachedProductBrand`
 * (`lib/product-brand.ts`) subscribes to it and every PDP awaits that read —
 * under Cache Components a tag declared inside a nested cached read propagates
 * outward onto the awaiting route's CDN entry unconditionally. **Reverting this
 * classification while `lib/product-brand.ts` still carries `TAG.brands` turns
 * one brand-term edit into a site-wide DELETION**, so the two move together or
 * not at all.
 *
 * The four LAYOUT-CHROME tags below are the largest-reaching members of the
 * whole vocabulary. See `ROOT_LAYOUT_CHROME_TAGS` for their carriers.
 *
 * See `invalidatesManyPages` below for why the distinction exists at all.
 */
const WIDE_BLAST_RADIUS_EXACT: ReadonlySet<string> = new Set([
  TAG.products,
  TAG.collections,
  TAG.catalog,
  TAG.brands,
  // Layout chrome — on EVERY CDN entry by construction (see below).
  TAG.branding,
  TAG.footer,
  TAG.emailMarketing,
  TAG.settings,
]);

/**
 * Prefix families with the same whole-catalogue reach. `headkit:catalog:`
 * covers `headkit:catalog:cat:{slug}` as well — a category grid key that every
 * listing page and, through grid propagation, the home page subscribes to.
 * `headkit:route:` covers the synthetic landings (home / shop / sale / new /
 * featured), each of which is a whole page family rather than one entity.
 *
 * `headkit:menu:` is the fifth layout-chrome tag. It is a PREFIX family and not
 * an exact string because the location is part of the tag
 * (`headkit:menu:PRIMARY`, `…:FOOTER_POLICY`, …), and `KNOWN_MENU_LOCATIONS` is
 * this repo's list rather than WordPress's — enumerating them here would
 * silently mis-class a location the CMS starts firing that we do not yet list.
 * Every location is read by `fetchMenu` / `getFooterMenus`, both awaited by the
 * root layout, so the whole family is site-wide.
 */
const WIDE_BLAST_RADIUS_PREFIXES: readonly string[] = [
  "headkit:catalog:",
  "headkit:route:",
  "headkit:menu:",
];

/**
 * The five tags carried by reads the ROOT LAYOUT awaits, and therefore present
 * on every CDN entry in the storefront. Exported so a guard can bind the class
 * to the carriers rather than to a hand-kept list
 * (`lib/root-layout-chrome-tags.test.ts`).
 *
 * `app/layout.tsx` awaits `getBranding()`, `getFooterMenus()`,
 * `getBrandingAssets()` and `getEmailMarketingStatus()`, and `NavigationWrapper`
 * awaits `fetchMenu` for every header location. Their carriers are
 * `lib/branding.ts` (`TAG.branding`), `lib/email-marketing.ts`
 * (`TAG.emailMarketing`, `TAG.settings`) and
 * `components/headkit-ui/navigation-wrapper.tsx` (`TAG.menu(loc)`, `TAG.footer`,
 * `TAG.branding`).
 *
 * The rule this encodes, which is the durable half: **a tag's class follows its
 * CARRIERS, not what the tag means.** Anything reachable from a read
 * `app/layout.tsx` awaits is site-wide, however editor-facing it sounds — which
 * is why these five are wide even though each names a single CMS setting.
 *
 * The classification changes the MECHANISM, not the blast radius. A branding
 * purge still marks every entry in the storefront, because a tag on the root
 * layout is on every page by construction; those entries are now invalidated
 * (serve the existing copy, refresh behind the request) rather than deleted.
 * Shrinking the radius would mean moving the chrome out of the static shell
 * into a request-time island, which is a much larger change.
 */
export const ROOT_LAYOUT_CHROME_TAGS: readonly string[] = [
  TAG.branding,
  TAG.footer,
  TAG.menu("PRIMARY"),
  TAG.emailMarketing,
  TAG.settings,
];

/**
 * True when purging this tag can invalidate MANY pages at once (the whole
 * catalogue, a whole route family, the brand-term domain every PDP subscribes
 * to, or the layout chrome that sits on every entry), rather than the one page
 * an editor is looking at after a save.
 *
 * The distinction exists because the two classes WANT opposite purge semantics
 * at the CDN (see `app/api/revalidate/route.ts`, the only caller): a narrow tag
 * should be DELETED so the editor's next load is guaranteed fresh, while a wide
 * tag should be INVALIDATED so the thousands of pages it touches keep serving
 * their previous copy while they refresh in the background, instead of each
 * blocking its first visitor on a foreground re-render.
 *
 * Deletion remains the wide class's FALLBACK when the runtime handed the
 * invocation no purge API or that call rejected — fail towards slow, never
 * towards wrong.
 *
 * Deliberately NOT wide: the singular entity tags (`headkit:product:{slug}`,
 * `headkit:collection:{slug}`, `headkit:brand:{slug}`, `headkit:post:{slug}`,
 * …) and the small type indexes (`headkit:posts`, `headkit:projects`,
 * `headkit:clients`, `headkit:pages`). Each reaches at most a page or a single
 * index, which an editor checks immediately after saving.
 *
 * `headkit:brand:{slug}` staying narrow beside a wide `headkit:brands` is
 * load-bearing, not an oversight: it is the product-SET tag, its reach is the
 * `/brand/{slug}` grid plus that brand's PLP shell, and deleting it is what
 * keeps an editor's own brand page guaranteed-fresh once the term tag beside it
 * only invalidates.
 *
 * The cost of the chrome tags being wide, stated rather than implied: an editor
 * who saves branding, a menu, the footer or an email-marketing / Stripe setting
 * may read the PREVIOUS copy once while it refreshes behind them, instead of
 * blocking on a fresh render. That is a stale-while-revalidate cost paid by one
 * person who is looking, against every visitor of every page paying a cold
 * render.
 *
 * Every member of the `TAG` contract is pinned to one class or the other by
 * `lib/cache-tags.test.ts`, so a tag added to `TAG` without a deliberate
 * classification fails CI rather than silently taking the narrow default.
 */
export function invalidatesManyPages(tag: string): boolean {
  if (WIDE_BLAST_RADIUS_EXACT.has(tag)) return true;
  for (const prefix of WIDE_BLAST_RADIUS_PREFIXES) {
    if (tag.startsWith(prefix) && tag.length > prefix.length) return true;
  }
  return false;
}

/**
 * The tag that already covers `path`, or `null` when no tag in `payloadTags`
 * does — the input to the route's decision to SKIP `revalidatePath(path)`.
 *
 * ## Why this exists, and why it ships with the invalidate change
 *
 * `revalidatePath()` has **no lifetime parameter anywhere in `next/cache`**. It
 * builds the implicit tag `_N_T_${path}` and calls the shared revalidate with no
 * profile, which is an unconditional DELETE. A delete is strictly stronger than
 * an invalidate, so it wins regardless of ordering: sending a wide tag through
 * the purge API and then deleting the same page by its path one line later
 * leaves the page exactly as it was, while every log line says the invalidate
 * fired. Without this rule the wide-purge change is inert on every page that
 * appears in a webhook's `paths` array — which is every page anyone looks at.
 *
 * ## Why skipping is SAFE — by construction, not by luck
 *
 * Two independent facts, both readable in
 * `integrations/wordpress/theme/inc/headkit-webhook.php`:
 *
 * 1. **The sender builds a path and its covering tag from the same term, in the
 *    same function.** `headkit_build_product_revalidation` pushes
 *    `"/products/{$slug}"` and `headkit_tag_product($slug)` on adjacent lines
 *    off one `$post->post_name`. `headkit_category_term_surfaces` takes its path
 *    from `headkit_build_collection_path_from_term($term)` — whose LAST segment
 *    is `$term->slug` — and its tags from `headkit_tag_catalog_cat()` /
 *    `headkit_tag_collection()` over the same `$term`. `headkit_resolve_endpoint_tags`
 *    pairs `project_{slug}`, `projects` and `page_{uri}` the same way, and the
 *    `page_` branch takes `get_page_uri($post)`, so a nested page's path and its
 *    `headkit:page:a/b` tag carry the identical multi-segment string.
 * 2. **The covering tag's reach is a SUPERSET of the path's.** A path purge
 *    reaches exactly one route entry; each tag below is carried by a cached read
 *    the same route awaits, and tags propagate onto the awaiting route's CDN
 *    entry from any depth. Checked against this app's `cacheTag` call sites in
 *    `lib/product-cache.ts`, `lib/catalog-cache.ts`,
 *    `app/collections/[...slug]/page.tsx`, `app/projects/[...slug]/page.tsx`,
 *    `app/projects/page.tsx` and `app/[...slug]/page.tsx`.
 *
 * ## The rules, and what is deliberately left uncovered
 *
 * Candidates are decided by FIRST SEGMENT so the families can never overlap — a
 * WordPress page whose URI happened to start `collections/` must not have its
 * `headkit:page:collections/x` tag accepted as cover for the collections route,
 * which that tag does not reach.
 *
 * Uncovered on purpose, and each of these still gets its `revalidatePath`:
 * `/` (the theme emits no path for a home edit), any path whose matching tag was
 * DROPPED by `isKnownTag` (a dropped tag purged nothing, so it covers nothing —
 * which is why the caller must pass the FILTERED tag list), and any shape not
 * enumerated below. **A path with no covering tag must always be purged**: a
 * page purged by neither a path nor a tag is stale for the whole of its cache
 * life, silently.
 *
 * @param path        A path from the webhook payload (`/collections/a/b`).
 * @param payloadTags The tags of the SAME payload, AFTER `isKnownTag` filtering.
 * @returns The covering tag, or `null` when the path must still be purged.
 */
export function tagCoveringPath(
  path: string,
  payloadTags: readonly string[],
): string | null {
  for (const candidate of coveringTagCandidates(path)) {
    if (payloadTags.includes(candidate)) return candidate;
  }
  return null;
}

/**
 * Tags that, if present in the same payload, cover `path` — in preference
 * order. Empty for any shape whose coverage is not established above.
 */
function coveringTagCandidates(path: string): string[] {
  if (typeof path !== "string" || !path.startsWith("/")) return [];
  // Query / fragment are not part of a `_N_T_` implicit tag; strip before
  // matching so a decorated path is classified as the page it is.
  const bare = path.split("?")[0]?.split("#")[0] ?? "";
  const segments = bare.split("/").filter((s) => s.length > 0);
  const first = segments[0];
  const leaf = segments[segments.length - 1];
  // "/" — the theme emits no path for a home edit; never skipped.
  if (first === undefined || leaf === undefined) return [];
  const depth = segments.length;

  // `/products/{slug}` ← the product entity tag.
  if (first === "products") {
    return depth === 2 ? [TAG.product(leaf)] : [];
  }

  // `/collections/{…ancestors}/{leaf}` ← the leaf's grid tag, or its collection
  // entity tag on a listing event (`headkit_category_term_surfaces`).
  if (first === "collections") {
    return depth >= 2 ? [TAG.catalogCat(leaf), TAG.collection(leaf)] : [];
  }

  // `/projects` and `/projects/{slug}`. The index also arrives as a `page_projects`
  // send, which carries `headkit:page:projects` for the same path.
  if (first === "projects") {
    if (depth === 1) return [TAG.projects, TAG.page("projects")];
    return depth === 2 ? [TAG.project(leaf)] : [];
  }

  // Everything else is the CMS page family: the theme sends `/{get_page_uri()}`
  // beside `headkit:page:{the same uri}`, with two landing slugs it swaps for a
  // route tag instead of a page tag.
  const uri = segments.join("/");
  if (uri === "sale") return [TAG.route("sale")];
  if (uri === "new-in") return [TAG.route("new")];
  return [TAG.page(uri)];
}
