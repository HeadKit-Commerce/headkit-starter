/** Default blog base when WordPress has no Posts page (Settings → Reading). */
export const DEFAULT_POSTS_BASE_PATH = "news";

/**
 * Storefront route segments that must never become the blog base path.
 * Collisions would steal shop/account/checkout (etc.) from the App Router.
 */
const RESERVED_POSTS_BASE = new Set([
  "account",
  "api",
  "brand",
  "checkout",
  "client",
  "collections",
  "contact",
  "faq",
  "featured",
  "new",
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
