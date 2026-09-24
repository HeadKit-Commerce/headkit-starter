import { getStoreTheme } from "@/lib/store-theme";

/**
 * WordPress publishes empty placeholder pages for its own internal wiring.
 * WooCommerce keeps a real page node for its cart and my-account screens even
 * in a headless store, and the starter has no dedicated Next.js route to
 * shadow them — so `app/[...slug]` renders them as a real 200 with an H1 and
 * no body, and `app/sitemap.ts` advertises them.
 *
 * ONE list governs both, so the catch-all gate and the sitemap's CMS-page
 * discovery can never disagree: a slug that 404s here can never also appear in
 * the sitemap, without either file restating the other's rule.
 *
 * Every key is a BARE top-level slug (no leading slash) and is matched
 * EXACTLY, never as a prefix — a store with a real `/cart/something` page
 * keeps it.
 *
 * `shop`, `checkout` and `faq` carry the identical empty WooCommerce/WordPress
 * page, but each already has a dedicated Next.js route that resolves before
 * the request reaches the catch-all, so listing them here would be dead code.
 *
 * WHAT IS NOT IN THE DEFAULT. Only slugs WooCommerce creates on every store,
 * and which are empty by construction. A store's own empty parent page — a
 * `legal` or `policies` node whose children are the real pages — is not
 * general to the platform, so a store names its own in `overrides/theme.json`
 * under `cms.placeholderNotFound` / `cms.placeholderRedirects`. Store entries
 * ADD to these defaults and can override a default redirect's target by
 * repeating its key. A store that wants a default rendered instead gives that
 * slug a dedicated route under `app/`, which resolves ahead of the catch-all.
 */
const DEFAULT_PLACEHOLDER_NOT_FOUND: readonly string[] = ["cart"];

/**
 * Bare slug → destination path. `my-account` is the same kind of empty
 * WooCommerce page as the set above, but old bookmarks and surviving external
 * links point at it, so it gets a permanent redirect to the storefront's real
 * account route instead of a 404.
 */
const DEFAULT_PLACEHOLDER_REDIRECTS: Readonly<Record<string, string>> = {
  "my-account": "/account",
};

/** Bare slugs the catch-all must 404 and the sitemap must not advertise. */
export function cmsPlaceholderNotFound(): ReadonlySet<string> {
  return new Set([
    ...DEFAULT_PLACEHOLDER_NOT_FOUND,
    ...(getStoreTheme().cms?.placeholderNotFound ?? []),
  ]);
}

/** Bare slug → permanent redirect target, store entries last. */
export function cmsPlaceholderRedirects(): Readonly<Record<string, string>> {
  return {
    ...DEFAULT_PLACEHOLDER_REDIRECTS,
    ...(getStoreTheme().cms?.placeholderRedirects ?? {}),
  };
}

/**
 * The one decision both consumers make: 404, redirect, or render.
 *
 * A slug listed in both lands on `notFound` — a store that lists a slug twice
 * gets the safer of the two rather than a redirect into a page it just said
 * does not exist.
 */
export function cmsPlaceholderVerdict(
  contentSlug: string,
): { kind: "not-found" } | { kind: "redirect"; to: string } | null {
  if (cmsPlaceholderNotFound().has(contentSlug)) return { kind: "not-found" };
  const to = cmsPlaceholderRedirects()[contentSlug];
  return to ? { kind: "redirect", to } : null;
}
