import type { Metadata } from "next";
import { cacheLife, cacheTag } from "next/cache";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";
import type {
  Product,
  HeroCarouselItem,
  FeaturedCategory,
  FeaturedBrand,
  Post,
} from "@headkit/sdk";
import { processEditorBlocks } from "@/lib/process-editor-blocks";
import {
  makeRootMetadata,
  resolveHomeTitle,
  resolveHomeDescription,
  resolveStoreName,
} from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import { MainCarousel } from "@/components/headkit-ui/main-carousel";
import { BlockEditor } from "@/components/headkit-ui/block-editor";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { CategoryCarousel } from "@/components/headkit-ui/category-carousel";
import { BrandCarousel } from "@/components/headkit-ui/brand-carousel";
import { PostCarousel } from "@/components/headkit-ui/post-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ProductCard } from "@/components/headkit-ui/product-card";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [{ homepage }, { seoSettings, storeSettings }, { iconUrl }] =
      await Promise.all([getHomepageData(), getBranding(), getBrandingAssets()]);
    const siteName = resolveStoreName(storeSettings.name);
    const yoastSeo = homepage?.page?.seo;
    const entityOg =
      (
        yoastSeo as
          | { opengraphImageUrl?: string | null }
          | null
          | undefined
      )?.opengraphImageUrl ?? null;

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

  try {
    const [homepage, newArrivals, onSaleProducts] = await Promise.all([
      headkit.homepage.get(),
      headkit.collections.list({ isNew: true }, 1, 8).catch(() => ({
        products: [] as Product[],
        total: 0,
        page: 1,
        perPage: 8,
        totalPages: 0,
      })),
      headkit.collections.list({ onSale: true }, 1, 8).catch(() => ({
        products: [] as Product[],
        total: 0,
        page: 1,
        perPage: 8,
        totalPages: 0,
      })),
    ]);

    return { homepage, newArrivals, onSaleProducts };
  } catch {
    return { homepage: null, newArrivals: null, onSaleProducts: null };
  }
}

export async function HomeContent() {
  "use cache";
  cacheLife("days");
  cacheTag(...HOME_TAGS);

  const { homepage, newArrivals, onSaleProducts } = await getHomepageData();

  const carousels = (homepage?.carousels ??
    []) as unknown as HeroCarouselItem[];
  const featuredCategories = (homepage?.featuredCategories ??
    []) as unknown as FeaturedCategory[];
  const featuredBrands = (homepage?.featuredBrands ??
    []) as unknown as FeaturedBrand[];
  const featuredProducts = (homepage?.featuredProducts ??
    []) as unknown as Product[];
  const latestPosts = (homepage?.latestPosts ?? []) as unknown as Post[];
  const editorBlocks = processEditorBlocks(
    homepage?.page?.content ?? "",
    (homepage?.page?.editorBlocks ?? []) as Array<{ products?: unknown[] }>,
  );

  return (
    <>
      {/* Hero Carousel */}
      {carousels.length > 0 && <MainCarousel carouselItems={carousels} />}

      <BlockEditor blocks={editorBlocks} section="section-1" />

      {/* Featured Products */}
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

      <BlockEditor blocks={editorBlocks} section="section-2" />

      {/* New Arrivals — Grid layout */}
      {newArrivals && newArrivals.products.length > 0 && (
        <section className="py-10">
          <SectionHeader
            title="New Arrivals"
            description=""
            allButton="View All"
            allButtonPath="/new"
            className="px-5 md:px-10"
          />
          <div className="mt-5 grid grid-cols-2 gap-4 px-5 md:grid-cols-4 md:px-10">
            {newArrivals.products.slice(0, 8).map((product) => (
              <ProductCard key={product.id} product={product} isNew />
            ))}
          </div>
        </section>
      )}

      {/* On Sale */}
      {onSaleProducts && onSaleProducts.products.length > 0 && (
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

      {/* Shop by Category */}
      {featuredCategories.length > 0 && (
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

      {/* Brands */}
      {featuredBrands.length > 0 && (
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

      {/* Latest News */}
      {latestPosts.length > 0 && (
        <section className="overflow-hidden py-10">
          <SectionHeader
            title="Latest News"
            description=""
            allButton="View All"
            allButtonPath="/news"
            className="px-5 md:px-10"
          />
          <div className="mt-5">
            <PostCarousel posts={latestPosts} />
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
