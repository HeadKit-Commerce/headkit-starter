import { cacheTag } from "next/cache";
import { cacheLifeForProfile } from "@/lib/cache-profile";
import { headkit as sdk } from "@/lib/sdk";

/**
 * Aggregated facet options (categories/attributes/price bounds), store-wide
 * and un-scoped. `"use cache: remote"`, not plain `"use cache"`: the plain
 * directive is a per-instance in-memory LRU that does not persist across
 * requests in serverless.
 *
 * ONE shared entry for every landing route that needs it (`/shop`, `/sale`,
 * `/new`, `/featured`, `/brand/[...slug]`, `/search`) — the call takes no
 * arguments, so a route-local copy of this function is a SEPARATE cache
 * entry keyed by its own module, not a separate result. Six local copies
 * meant up to six cold fills of a 13-16s WordPress aggregation per deploy;
 * `/shop` is prerendered at build, so importing this single function lets
 * that build fill the one entry and every other route hit it warm at
 * runtime. See `data/260925-bs-enable-nav-skeleton/report.md` §5.
 */
export async function getCatalogFilters() {
  "use cache: remote";
  cacheLifeForProfile("hours", "max");
  cacheTag("catalog:filters");
  return sdk.collections.getFilters();
}
