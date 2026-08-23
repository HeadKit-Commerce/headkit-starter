import type { MetadataRoute } from "next";

/**
 * A storefront route this STORE adds to its sitemap.
 *
 * Same shape as the platform's own static routes in `app/sitemap.ts`, so an
 * entry here is emitted exactly as if it had been hardcoded there.
 */
export type StoreSitemapRoute = {
  /**
   * Site-relative path with a leading slash and no trailing slash — `/lookbook`,
   * `/collections/spring-2026`. The home page cannot be declared here: the
   * platform always emits it itself, so `""` and `"/"` are both dropped.
   *
   * A value that is not a site-relative path (an absolute URL, a
   * protocol-relative `//host/x`, a bare `lookbook`), or one carrying a query, a
   * hash, whitespace, a control character or a character that is illegal as raw
   * XML text (`&`, `<`, `>`), is DROPPED rather than emitted — see
   * `normaliseStoreSitemapRoutes` in `app/sitemap.ts`. That keeps an off-site or
   * malformed `<loc>` impossible by construction, matching the guarantee the
   * product and page sections already make. A path needing one of those
   * characters must percent-encode it here (`/dolce%26gabbana`); the platform
   * will not rewrite it for you, because a silent rewrite is a change you
   * cannot see.
   */
  path: string;
  /**
   * One of the sitemap protocol's `<changefreq>` values. An entry declaring
   * anything else is dropped rather than emitted malformed.
   */
  changeFrequency: NonNullable<
    MetadataRoute.Sitemap[number]["changeFrequency"]
  >;
  /**
   * 0.0–1.0. A finite value outside that range is clamped. A value that is not
   * a finite number — `NaN` from `Number(process.env.X)` with the var unset,
   * say — has no nearest in-range value to clamp toward, so the whole entry is
   * dropped instead.
   */
  priority: number;
};

/**
 * THE STORE'S SITEMAP EXTENSION POINT — edit this file, never `app/sitemap.ts`.
 *
 * `app/sitemap.ts` is shared platform code that every store inherits from the
 * starter template. A store with its own hardcoded landing page — a storefront
 * route, not a WordPress page, so the CMS-page section cannot discover it — used
 * to have no way into the sitemap except editing that shared file, and every
 * such edit made the next template update harder to take. Declaring the route
 * here keeps the platform file byte-identical to the template.
 *
 * Shipped EMPTY on purpose: a store that adds nothing needs no edit at all, and
 * an empty array produces the exact sitemap the platform produced before this
 * extension point existed.
 *
 * Both consumers of the platform route list see these entries — the static
 * section that emits them, and the CMS-page probe loop that skips paths already
 * covered — because `staticSitemapRoutes()` appends them to the ONE list both
 * read. So a path declared here that is ALSO a WordPress page still appears
 * exactly once, and a path that duplicates a platform route is dropped in
 * favour of the platform's own entry.
 *
 * These routes are gated by `enableSitemap` like everything else: with the
 * sitemap switched off the document is empty, store routes included.
 *
 * ## Resolve-or-do-not-advertise: these entries are NOT probed
 *
 * The file's standing rule is that the sitemap only advertises URLs that
 * actually serve, and every other section earns that — products fall back to a
 * route that always serves, CMS pages are confirmed with a `content()` probe.
 * Store routes are deliberately the exception, and this is a decision, not an
 * oversight:
 *
 *  - There is nothing to probe. These are Next.js routes under `app/`, not CMS
 *    content; a `content(type: PAGE)` probe would report "missing" for a
 *    perfectly good `app/lookbook/page.tsx`, so probing would exclude exactly
 *    the routes this extension point exists to include. Fetching the route over
 *    HTTP from inside its own build/render is not an option either.
 *  - The author is the store, editing its own repository, naming a route it
 *    just wrote. That is the same standard the platform's own hardcoded list is
 *    held to — `/sale` and `/featured` are not probed either.
 *
 * What IS enforced is SHAPE, and only shape: an entry that could produce an
 * off-site or malformed tag is dropped — a path that is not site-relative or
 * carries a query, hash, whitespace, control character or XML-illegal
 * character, a `changeFrequency` outside the protocol's values, a non-finite
 * `priority`. An export that is not an array at all degrades to no store routes
 * rather than throwing, since a throw here would take the whole sitemap down.
 * Whether a path RESOLVES is the separate question, and it is the store's: a
 * well-formed path that 404s is emitted, and is the store's to fix.
 *
 * @example
 * export const storeSitemapRoutes: readonly StoreSitemapRoute[] = [
 *   { path: "/lookbook", changeFrequency: "weekly", priority: 0.8 },
 *   { path: "/stockists", changeFrequency: "monthly", priority: 0.5 },
 * ];
 */
export const storeSitemapRoutes: readonly StoreSitemapRoute[] = [];
