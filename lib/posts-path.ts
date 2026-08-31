/** Default blog base when WordPress has no Posts page (Settings → Reading). */
export const DEFAULT_POSTS_BASE_PATH = "news";

/**
 * Storefront route segments that must never become the blog base path.
 * Collisions would steal shop/account/checkout (etc.) from the App Router.
 *
 * A `redirects()` source in `next.config.ts` is a storefront route too, and
 * omitting one is not a cosmetic miss — it is an infinite redirect. The whole
 * class is asserted in `posts-path.test.ts` against the live config, so a new
 * redirect source cannot be added without also reserving it here.
 */
const RESERVED_POSTS_BASE = new Set([
  "account",
  "api",
  "blogs",
  "blog",
  "brand",
  "checkout",
  "client",
  "collections",
  "contact",
  "faq",
  "featured",
  "new",
  "pages",
  // `next.config.ts:205-206` 308s `/posts` (and `/posts/:slug*`) to `/news`
  // unconditionally. A store whose WordPress Posts page slug is `posts` would
  // therefore have `proxy.ts` 308 `/news` → `/posts` while the config 308s it
  // straight back — the two are exact inverses and the blog is unreachable.
  "posts",
  "products",
  "projects",
  "quote",
  "sale",
  "search",
  "shop",
  "wholesale",
]);

/**
 * Normalise a candidate Posts-page slug into a single safe path segment.
 * Returns null when empty, nested, or reserved.
 */
export function normalizePostsBasePath(
  raw: string | null | undefined,
): string | null {
  if (!raw) return null;
  const slug = raw
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase();
  if (!slug || slug.includes("/") || slug.includes("..")) return null;
  if (RESERVED_POSTS_BASE.has(slug)) return null;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  return slug;
}

/** Listing href for the storefront blog (`/news` or `/insights`, …). */
export function postsIndexPath(base: string): string {
  const segment = normalizePostsBasePath(base) ?? DEFAULT_POSTS_BASE_PATH;
  return `/${segment}`;
}

/** Single-post href under the storefront blog base. */
export function postsArticlePath(base: string, postSlug: string): string {
  const article = postSlug.trim().replace(/^\/+|\/+$/g, "");
  return `${postsIndexPath(base)}/${article}`;
}

/**
 * Resolve a post card href from either a storefront-relative URI or a bare slug.
 */
export function resolvePostHref(
  uriOrSlug: string,
  postsBasePath: string = DEFAULT_POSTS_BASE_PATH,
): string {
  const trimmed = uriOrSlug.trim();
  if (!trimmed) return postsIndexPath(postsBasePath);
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }
  if (trimmed.startsWith("/")) {
    return trimmed.replace(/\/$/, "") || postsIndexPath(postsBasePath);
  }
  return postsArticlePath(postsBasePath, trimmed);
}
