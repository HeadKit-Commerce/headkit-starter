/**
 * Fold a V1 facet QUERY string on a `/collections/...` URL into the canonical
 * `/f/<slug>` PATH form, as a 308 issued by `proxy.ts` before the route runs.
 *
 * Pure and dependency-free so it can be asserted without a running app, and so
 * the proxy bundle stays clear of the UI layer — the same rule
 * `lib/canonical-redirect-request.ts` states for itself. The codec is the one
 * in `lib/filter-slug.ts`, never a second copy.
 *
 * ### Why the proxy and not the page
 *
 * The route used to do this in a server component below its `<Suspense>`
 * boundary, which cost it twice. It had to await `searchParams`, and under
 * Cache Components that opts the whole segment dynamic — the 0-byte shell the
 * listing routes now exist to avoid. And a `permanentRedirect` below a boundary
 * cannot set a status line at all: it answered 200 with a client-side
 * `NEXT_REDIRECT` payload, so no crawler ever saw a 308 and the V1 link equity
 * went nowhere (measured live on the Bike Society fork, 2026-09-15). The proxy
 * sees the whole URL before any of that, so it can answer a real 308.
 *
 * `CollectionProvider`'s mount effect still performs the same navigation for a
 * JS-on shopper. That is the fallback for URLs this never sees — `proxy.ts`'s
 * matcher excludes any path containing a dot — not a second source of truth.
 */
import { encodeFilterSlug, type FilterSlugInput } from "@/lib/filter-slug";
import { COLLECTION_PATH_PREFIX } from "@/lib/route-prefixes";

const COLLECTION_PREFIX = `/${COLLECTION_PATH_PREFIX}/`;

/**
 * Query keys that are collection STATE rather than facets, and so ride through
 * the redirect on the query string. They are the params `CollectionProvider`
 * applies after hydration; none is canonical or in the sitemap.
 */
const PRESERVED_QUERY_KEYS = [
  "q",
  "page",
  "sort",
  "price_min",
  "price_max",
  "instock",
  "categories",
] as const;

const PRESERVED = new Set<string>(PRESERVED_QUERY_KEYS);

/**
 * Which query keys name a facet. Deliberately an ALLOWLIST shape rather than
 * "anything not preserved":
 *
 * A WooCommerce product attribute taxonomy is always `pa_`-prefixed, and
 * `encodeFilterSlug` strips that prefix while `decodeFilterSlug` restores it —
 * so a non-`pa_` key cannot round-trip through the path form at all. Treating
 * every unrecognised key as a facet would therefore 308 a campaign link
 * (`?utm_source=…`, `?gclid=…`, `?fbclid=…`, `?_kx=…`) onto a junk facet URL
 * that decodes to an attribute no store has, and answers 200 with an empty
 * grid. Those params are common on exactly the external links this redirect
 * exists to serve.
 */
function facetKind(key: string): "brand" | "attribute" | null {
  if (PRESERVED.has(key)) return null;
  if (key === "brands") return "brand";
  if (key.startsWith("pa_")) return "attribute";
  return null;
}

/**
 * The `/f/<slug>` URL for a legacy facet query, or `null` when this request is
 * not one. `null` means "leave the request alone": a non-collection path, a
 * path that already carries an `/f/` segment, or a query with no facet key.
 *
 * Unrecognised query keys are carried through UNCHANGED on the redirect target
 * rather than dropped, so a campaign link that also names a facet keeps its
 * attribution.
 */
export function legacyFacetRedirectPath(
  pathname: string,
  search: string,
): string | null {
  if (!pathname.startsWith(COLLECTION_PREFIX)) return null;
  if (pathname.split("/").includes("f")) return null;

  const incoming = new URLSearchParams(search);
  const selected: FilterSlugInput = { attributes: {}, brands: [] };
  const passthrough = new URLSearchParams();
  let hasFacet = false;

  for (const [key, value] of incoming.entries()) {
    const kind = facetKind(key);
    if (kind === null || !value) {
      if (value) passthrough.append(key, value);
      continue;
    }
    const values = value.split(",").filter(Boolean);
    if (values.length === 0) continue;
    hasFacet = true;
    if (kind === "brand") selected.brands.push(...values);
    else selected.attributes[key] = values;
  }

  if (!hasFacet) return null;
  const slug = encodeFilterSlug(selected);
  if (!slug) return null;

  const base = pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  const query = passthrough.toString();
  return `${base}/f/${slug}${query ? `?${query}` : ""}`;
}
