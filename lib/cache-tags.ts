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
  page: (slug: string): string => `headkit:page:${slug}`,
  // type/index — fired on create/delete of that type
  products: "headkit:products",
  collections: "headkit:collections",
  brands: "headkit:brands",
  posts: "headkit:posts",
  projects: "headkit:projects",
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
  route: (r: "home" | "shop" | "sale" | "new"): string => `headkit:route:${r}`,
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
    return [TAG.route("home")];
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
