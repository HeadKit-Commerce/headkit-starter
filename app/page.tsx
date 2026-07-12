import type { Metadata } from "next";
import { Suspense } from "react";
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
import { makeRootMetadata } from "@/lib/make-metadata";
import { MainCarousel } from "@/components/headkit-ui/main-carousel";
import { BlockEditor } from "@/components/headkit-ui/block-editor";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { CategoryCarousel } from "@/components/headkit-ui/category-carousel";
import { BrandCarousel } from "@/components/headkit-ui/brand-carousel";
import { PostCarousel } from "@/components/headkit-ui/post-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ProductCard } from "@/components/headkit-ui/product-card";
import { Skeleton } from "@/components/ui/skeleton";

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { homepage } = await getHomepageData();
    return makeRootMetadata({
      title: homepage?.page?.seo?.title ?? "HeadKit — Headless Commerce",
      description:
        homepage?.page?.seo?.metaDesc ??
        "Build fast, modern headless commerce stores with HeadKit.",
      siteName: "HeadKit",
    });
  } catch {
    return makeRootMetadata({
      title: "HeadKit — Headless Commerce",
      description: "Build fast, modern headless commerce stores with HeadKit.",
    });
  }
}

/**
 * Home cache-tag union (D7 / CACHE-04). Home is ONE monolithic cached entry, so
 * both cached home fns carry the SAME union: editing any home source fires that
 * source's WP tag and re-renders the single home entry. Per-module split (each
 * `<HeroCarousel/>`/`<NewsRail/>`/… own-tagged) is DEFERRED — it needs new SDK
 * methods + subgraph resolvers; the SDK exposes only aggregate `homepage.get()`.
 */
const HOME_TAGS: readonly string[] = [
  TAG.route("home"),
  TAG.module("carousel"),
  TAG.module("news"),
  TAG.module("brand"),
  TAG.module("featured"),
  TAG.products,
];

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

function ProductGridSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-4 px-5 md:grid-cols-4 md:px-10">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="space-y-3">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/3" />
        </div>
      ))}
    </div>
  );
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
  return (
    <div className="overflow-hidden">
      <Suspense fallback={<ProductGridSkeleton />}>
        <HomeContent />
      </Suspense>
    </div>
  );
}
