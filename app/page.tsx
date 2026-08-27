import type { Metadata } from "next";
import { unstable_rethrow } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";
import type { Product, HeroCarouselItem, FeaturedCategory } from "@headkit/sdk";
import {
  processHomepageContent,
  getBlockQueryType,
  hasEditorSectionClass,
} from "@/lib/process-editor-blocks";
import {
  makeRootMetadata,
  resolveHomeTitle,
  resolveHomeDescription,
  resolveStoreName,
  storefrontUrl,
} from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import {
  filterCategoriesByNonEmptySlugs,
  getNonEmptyCollectionSlugs,
} from "@/lib/hide-empty-collections";
import { collectionPathResolver } from "@/lib/collection-path";
import { MainCarousel } from "@/components/headkit-ui/main-carousel";
import { getStoreTheme } from "@/lib/store-theme";
import { BlockEditor } from "@/components/headkit-ui/block-editor";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { CategoryCarousel } from "@/components/headkit-ui/category-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";

const EMPTY_COLLECTION = {
  products: [] as Product[],
  total: 0,
  page: 1,
  perPage: 8,
  totalPages: 0,
};

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [{ homepage }, { seoSettings, storeSettings }, { iconUrl }] =
      await Promise.all([
        getHomepageData(),
        getBranding(),
        getBrandingAssets(),
      ]);
    const siteName = resolveStoreName(storeSettings.name);
    const yoastSeo = homepage?.page?.seo;
    const entityOg =
      (yoastSeo as { opengraphImageUrl?: string | null } | null | undefined)
        ?.opengraphImageUrl ?? null;

    return await makeRootMetadata({
      title: resolveHomeTitle({
        yoastTitle: yoastSeo?.title,
        dashboardTitle: seoSettings.title,
        storeName: storeSettings.name,
      }),
      description: resolveHomeDescription({
        yoastDescription: yoastSeo?.metaDesc,
        dashboardDescription: seoSettings.description,
      }),
      siteName,
      iconUrl,
      ogImageUrl: entityOg || seoSettings.ogImageUrl,
      allowIndexing: seoSettings.allowIndexing,
      siteUrl: storeSettings.domain,
      // Self-referencing canonical for `/`. The highest-authority URL on the
      // site had none, leaving it undefended against `?utm_*` / `?gclid` and
      // trailing-slash duplicates.
      canonical: storefrontUrl("/", storeSettings.domain),
    });
  } catch (error) {
    unstable_rethrow(error);
    // Same fail-closed rule as the root layout: an unreadable branding read
    // leaves the store's indexing switch unknown, and app/robots.ts answers
    // that failure with `Disallow: /`.
    return await makeRootMetadata({ siteName: "Store", allowIndexing: false });
  }
}

/**
 * Home cache-tag(s) (D7 / CACHE-04). Home is ONE monolithic cached entry backed
 * by a single aggregate `homepage.get()`. Primary tag: `route:home` (carousel,
 * news, featured/new/sale product, page-on-front). Also tags branding +
 * collections because HomeContent reads hide-empty branding and may filter
 * featured categories from the catalog.
 *
 * The former per-module `module:{carousel,news,brand,featured}` tags were
 * removed: with an indivisible `homepage.get()` bundle they could never
 * invalidate a section independently (they only ever purged the whole entry via
 * this union), so they were pure noise. True per-section revalidation needs the
 * data split first (per-module SDK methods + subgraph resolvers + WP endpoints).
 */
const HOME_TAGS: readonly string[] = [
  TAG.route("home"),
  TAG.branding,
  TAG.collections,
];

export async function getHomepageData() {
  "use cache";
  cacheLife("days");
  cacheTag(...HOME_TAGS);

  // Split fetches so a homepage.get() failure does not null On Sale
  // collections (P2 resilience).
  const [homepageResult, onSaleResult] = await Promise.allSettled([
    headkit.homepage.get(),
    headkit.collections.list({ onSale: true }, 1, 8),
  ]);

  return {
    homepage:
      homepageResult.status === "fulfilled" ? homepageResult.value : null,
    onSaleProducts:
      onSaleResult.status === "fulfilled"
        ? onSaleResult.value
        : EMPTY_COLLECTION,
  };
}

export async function HomeContent() {
  "use cache";
  cacheLife("days");
  cacheTag(...HOME_TAGS);

  const { homepage, onSaleProducts } = await getHomepageData();
  const { branding } = await getBranding();
  const nonEmptySlugs = branding.hideEmptyCollections
    ? await getNonEmptyCollectionSlugs()
    : null;

  const carousels = (homepage?.carousels ??
    []) as unknown as HeroCarouselItem[];
  const featuredCategoriesRaw = (homepage?.featuredCategories ??
    []) as unknown as FeaturedCategory[];
  const featuredCategoriesFiltered = nonEmptySlugs
    ? filterCategoriesByNonEmptySlugs(featuredCategoriesRaw, nonEmptySlugs)
    : featuredCategoriesRaw;
  // `FeaturedCategory` carries a slug and the raw WordPress permalink, neither
  // of which is a storefront path — resolve each tile's CANONICAL collection
  // path from the category tree so a nested category's tile does not link the
  // flat shape the collection route 308s away from.
  const collectionPath = await collectionPathResolver();
  const featuredCategories = featuredCategoriesFiltered.map((category) => ({
    ...category,
    uri: collectionPath(category.slug),
  }));
  const { blocks: editorBlocks, segments } = processHomepageContent(
    homepage?.page?.content ?? "",
    (homepage?.page?.editorBlocks ?? []) as Array<{
      products?: unknown[];
      attrs?: Record<string, unknown> | null;
      queryType?: string | null;
    }>,
  );

  // Prefer WP queryType carousels over hardcoded On Sale when the front page
  // already includes that HeadKit pattern (avoids duplicates).
  const wpQueryTypes = new Set(
    editorBlocks
      .map((b) => getBlockQueryType(b))
      .filter((qt): qt is string => qt !== null),
  );
  const showHardcodedSale =
    !wpQueryTypes.has("on-sale") &&
    onSaleProducts !== null &&
    onSaleProducts.products.length > 0;

  // Skip hardcoded Shop by Category when WP already provides the pattern.
  // Brands are CMS-only (headkit-brand-carousel) — never append a fallback
  // "Our Brands" strip after editor content (duplicates Clients / wrong order).
  const showHardcodedCategories =
    !hasEditorSectionClass(editorBlocks, "headkit-category-carousel") &&
    featuredCategories.length > 0;
  // Prefer WP hero pattern placement over the hardcoded top carousel.
  const showHardcodedHero =
    !hasEditorSectionClass(editorBlocks, "headkit-hero-carousel") &&
    carousels.length > 0;

  const heroLayout = getStoreTheme().layout.heroLayout;

  // The hardcoded "Featured Products" carousel USED TO RENDER HERE, together
  // with a <CarouselProductJsonLD> describing it. Both are gone: merchants
  // choose their own product sections from the CMS now, and unlike the three
  // hardcoded blocks below this one carried no WP-duplication guard, so on any
  // store whose WP front page includes a product carousel it re-advertised
  // products the shopper had already scrolled past.
  //
  // The JSON-LD went WITH it rather than being left behind. It was an ItemList
  // of exactly the products that carousel showed and had no other input, so
  // keeping it would leave the page publishing structured data for a carousel
  // that is not on the page — the mismatch between markup and visible content
  // that Google's structured-data policy calls out, and a worse outcome than
  // having no ItemList. The COMPONENT stays; only this call site is removed.
  //
  // `/featured` still exists as a route and is still in the sitemap; whether it
  // should survive as a standalone landing page without a homepage entry point
  // is a separate call and is deliberately not made here.
  return (
    <>
      {showHardcodedHero && (
        <MainCarousel carouselItems={carousels} heroLayout={heroLayout} />
      )}

      {/* WP front-page content in editor document order */}
      {segments.map((seg, index) => {
        if (seg.kind === "html") {
          return (
            <section
              key={`wp-html-${index}`}
              className="headkit-cms-html hk-section-content px-5 md:px-10 py-10"
            >
              <EditorialContent html={seg.html} />
            </section>
          );
        }
        return <BlockEditor key={`wp-block-${index}`} blocks={[seg.block]} />;
      })}

      {/* Platform commerce modules (not WP page blocks) */}

      {/* On Sale — skipped when WP already provides a product-on-sale carousel */}
      {showHardcodedSale && (
        <section className="headkit-product-carousel overflow-x-clip py-10">
          <SectionHeader
            title="On Sale"
            description=""
            allButton="View All"
            allButtonPath="/sale"
            className="px-5 md:px-10"
          />
          <div className="mt-8">
            <ProductCarousel
              products={onSaleProducts.products.slice(0, 12) as Product[]}
              id="on-sale-products"
            />
          </div>
        </section>
      )}

      {/* Shop by Category — skipped when WP provides headkit-category-carousel */}
      {showHardcodedCategories && (
        <section className="headkit-category-carousel overflow-hidden py-10">
          <SectionHeader
            title="Shop by Category"
            description=""
            allButton="View All"
            allButtonPath="/collections"
            className="px-5 md:px-10"
          />
          <div className="mt-8">
            <CategoryCarousel categories={featuredCategories} />
          </div>
        </section>
      )}
    </>
  );
}

/**
 * Instant Navigation (Next.js 16.3) — sync App Shell + Suspense streaming.
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function Home() {
  // HomeContent is fully cached ('use cache') — rendering it without a
  // Suspense boundary bakes it into the prerendered shell in document order,
  // so the homepage is visible without JavaScript.
  return (
    <div className="headkit-home overflow-hidden">
      <HomeContent />
    </div>
  );
}
