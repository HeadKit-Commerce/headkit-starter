import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";
import type {
  Product,
  HeroCarouselItem,
  FeaturedCategory,
  FeaturedBrand,
} from "@headkit/sdk";
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
} from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import { MainCarousel } from "@/components/headkit-ui/main-carousel";
import { BlockEditor } from "@/components/headkit-ui/block-editor";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { CategoryCarousel } from "@/components/headkit-ui/category-carousel";
import { BrandCarousel } from "@/components/headkit-ui/brand-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { CarouselProductJsonLD } from "@/components/seo/carousel-product-json-ld";

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

    return makeRootMetadata({
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
    });
  } catch {
    return makeRootMetadata({ siteName: "Store" });
  }
}

/**
 * Home cache-tag(s) (D7 / CACHE-04). Home is ONE monolithic cached entry backed
 * by a single aggregate `homepage.get()`, so it carries ONE tag: `route:home`.
 * Every WP home-source edit (carousel, news, featured/new/sale product,
 * page-on-front) emits `route:home` → the single home entry re-renders.
 *
 * The former per-module `module:{carousel,news,brand,featured}` tags were
 * removed: with an indivisible `homepage.get()` bundle they could never
 * invalidate a section independently (they only ever purged the whole entry via
 * this union), so they were pure noise. True per-section revalidation needs the
 * data split first (per-module SDK methods + subgraph resolvers + WP endpoints).
 */
const HOME_TAGS: readonly string[] = [TAG.route("home")];

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

  const carousels = (homepage?.carousels ??
    []) as unknown as HeroCarouselItem[];
  const featuredCategories = (homepage?.featuredCategories ??
    []) as unknown as FeaturedCategory[];
  const featuredBrands = (homepage?.featuredBrands ??
    []) as unknown as FeaturedBrand[];
  const featuredProducts = (homepage?.featuredProducts ??
    []) as unknown as Product[];
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

  // Same duplicate policy for Shop by Category / Our Brands when WP patterns
  // (headkit-category-carousel / headkit-brand-carousel) are on the front page.
  const showHardcodedCategories =
    !hasEditorSectionClass(editorBlocks, "headkit-category-carousel") &&
    featuredCategories.length > 0;
  const showHardcodedBrands =
    !hasEditorSectionClass(editorBlocks, "headkit-brand-carousel") &&
    featuredBrands.length > 0;
  // Prefer WP hero pattern placement over the hardcoded top carousel.
  const showHardcodedHero =
    !hasEditorSectionClass(editorBlocks, "headkit-hero-carousel") &&
    carousels.length > 0;

  return (
    <>
      {featuredProducts.length > 0 && (
        <CarouselProductJsonLD products={featuredProducts} />
      )}

      {showHardcodedHero && <MainCarousel carouselItems={carousels} />}

      {/* WP front-page content in editor document order */}
      {segments.map((seg, index) => {
        if (seg.kind === "html") {
          return (
            <section
              key={`wp-html-${index}`}
              className="hk-section-content px-5 md:px-10 py-10"
            >
              <EditorialContent html={seg.html} />
            </section>
          );
        }
        return <BlockEditor key={`wp-block-${index}`} blocks={[seg.block]} />;
      })}

      {/* Platform commerce modules (not WP page blocks) */}
      {featuredProducts.length > 0 && (
        <section className="overflow-hidden py-10">
          <SectionHeader
            title="Featured Products"
            description=""
            allButton="View All"
            allButtonPath="/featured"
            className="px-5 md:px-10"
          />
          <div className="mt-5">
            <ProductCarousel
              products={featuredProducts}
              id="featured-products"
            />
          </div>
        </section>
      )}

      {/* On Sale — skipped when WP already provides a product-on-sale carousel */}
      {showHardcodedSale && (
        <section className="overflow-hidden py-10 bg-gray-50">
          <SectionHeader
            title="On Sale"
            description=""
            allButton="View All"
            allButtonPath="/sale"
            className="px-5 md:px-10"
          />
          <div className="mt-5">
            <ProductCarousel
              products={onSaleProducts.products.slice(0, 12) as Product[]}
              id="on-sale-products"
            />
          </div>
        </section>
      )}

      {/* Shop by Category — skipped when WP provides headkit-category-carousel */}
      {showHardcodedCategories && (
        <section className="overflow-hidden py-10">
          <SectionHeader
            title="Shop by Category"
            description=""
            allButton="View All"
            allButtonPath="/collections"
            className="px-5 md:px-10"
          />
          <div className="mt-5">
            <CategoryCarousel categories={featuredCategories} />
          </div>
        </section>
      )}

      {/* Brands — skipped when WP provides headkit-brand-carousel */}
      {showHardcodedBrands && (
        <section className="overflow-hidden py-10">
          <SectionHeader
            title="Our Brands"
            description=""
            allButton=""
            className="px-5 md:px-10"
          />
          <div className="mt-5">
            <BrandCarousel brands={featuredBrands} />
          </div>
        </section>
      )}
    </>
  );
}

export default function Home() {
  // HomeContent is fully cached ('use cache') — rendering it without a
  // Suspense boundary bakes it into the prerendered shell in document order,
  // so the homepage is visible without JavaScript.
  return (
    <div className="overflow-hidden">
      <HomeContent />
    </div>
  );
}
