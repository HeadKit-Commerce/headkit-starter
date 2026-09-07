import { cacheLife, cacheTag } from "next/cache";
import { TAG } from "@/lib/cache-tags";
import { errorFields, logger } from "@/lib/logger";
import { headkit } from "@/lib/sdk";

/** The lightweight brand term the product payload carries. */
export interface ProductBrandTerm {
  id: string;
  name: string;
  slug: string;
}

/** What the PDP renders above the title and names in JSON-LD. */
export interface ProductDisplayBrand {
  name: string;
  slug: string;
  /** Brand logo URL from the brand term's thumbnail, when the merchant set one. */
  logoUrl: string | null;
}

/**
 * Which of a product's brand terms the PDP shows.
 *
 * The classic Bike Society storefront picked the edge flagged `isPrimary`, then
 * the parent-less term (a product tagged both "Specialized" and "S-Works" showed
 * S-Works). The `headkit/v2` product payload carries neither a primary flag nor
 * a parent relation on its brand terms, so the rule here is the FIRST term in
 * payload order — WordPress returns `product_brand` terms by name, which is one
 * stable value per product. `null` when the product has no brand, and the PDP
 * then renders exactly what it renders today.
 */
export function resolveDisplayBrand(
  brands: readonly ProductBrandTerm[] | null | undefined,
): ProductBrandTerm | null {
  const first = brands?.find(
    (b) => b.slug.trim() !== "" && b.name.trim() !== "",
  );
  return first ?? null;
}

/**
 * Brand logo for the PDP — ONE cache entry per brand, shared by every product
 * that carries it.
 *
 * Tagged `TAG.brand(slug)` only. The theme fires that tag on a brand-term edit
 * or delete (which is when a logo can change), and ALSO on every save of a
 * product in that brand — but the PDP route entry already carries
 * `TAG.products`, which the same product save fires, so this adds no purge the
 * PDP was not already subject to. `TAG.brands` is deliberately NOT added: it is
 * the index tag and buys nothing here beyond what the entity tag covers.
 *
 * A failed brand read is a missing logo, never a failed PDP: the product is
 * the page, the logo is decoration. `brands.get` answers the brand detail
 * (with a page of its products), so only the three fields the PDP needs are
 * returned — a "use cache" entry stores its return value.
 */
export async function getCachedProductBrand(
  slug: string,
): Promise<ProductDisplayBrand | null> {
  "use cache";
  cacheLife("days");
  cacheTag(TAG.brand(slug));
  try {
    const brand = await headkit.brands.get(slug);
    if (!brand) return null;
    const logoUrl = brand.image?.src || brand.thumbnail || null;
    return { name: brand.name, slug: brand.slug, logoUrl };
  } catch (error) {
    logger.info("pdp.brand_logo_unavailable", {
      brandSlug: slug,
      ...errorFields(error),
    });
    return null;
  }
}
