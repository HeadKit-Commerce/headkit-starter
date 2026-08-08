import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import type {
  ProductFieldsFragment,
  ProductSummaryFieldsFragment,
  ProjectSummaryFieldsFragment,
} from "@headkit/sdk";
import { headkit } from "@/lib/sdk";
import { getCachedProduct } from "@/lib/product-cache";
import { ProductDetail } from "@/components/headkit-ui/product-detail";
import { ProductStock } from "@/components/headkit-ui/product-stock";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { ProjectCarousel } from "@/components/headkit-ui/project/project-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ProductJsonLD } from "@/components/seo/product-json-ld";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { makeSeoMetadata, resolveStoreName } from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import { isColorAttrSlug } from "@/components/headkit-ui/collection/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { ProductPageShell } from "./product-page-shell";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

// Cache Components requires generateStaticParams to return ≥1 param. When the
// catalog API is unreachable at build we emit this single placeholder (which
// generateMetadata/the page resolve to noindex/notFound) instead of throwing —
// a transient backend error must not fail the whole tenant deploy. Mirrors the
// pattern in app/collections/[...slug]/page.tsx.
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

/**
 * WooCommerce shop archive slug (WP product permalinks use `/shop/…`).
 * Keep PDP crumbs aligned with category/shop pages — never `/products`.
 */
const SHOP_BREADCRUMB = { name: "Shop", href: "/shop" } as const;

type Props = {
  params: Promise<{ slug: string[] }>;
};

/** Re-export for PDP tag/life guard tests (ENG-853). */
export const getProduct = getCachedProduct;

function mapRelatedToProduct(
  r: ProductFieldsFragment["related"][number],
): ProductSummaryFieldsFragment {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    uri: `/products/${r.slug}`,
    isNew: false,
    price: r.price,
    regularPrice: r.regularPrice,
    salePrice: r.salePrice,
    onSale: r.onSale,
    type: r.type,
    stockStatus: r.stockStatus,
    image: r.image
      ? {
          src: r.image.src,
          alt: r.image.alt,
          width: r.image.width,
          height: r.image.height,
        }
      : null,
    hoverImage: r.hoverImage
      ? {
          src: r.hoverImage.src,
          alt: r.hoverImage.alt,
          width: r.hoverImage.width,
          height: r.hoverImage.height,
        }
      : null,
    attributes: r.attributes.map((a) => ({
      id: a.id,
      name: a.name,
      slug: a.slug,
      type: a.type,
      options: a.options,
      variation: a.variation,
      visible: a.visible,
      fullOptions: a.fullOptions,
    })),
    variations: r.variations.map((v) => ({
      id: v.id,
      price: v.price,
      regularPrice: v.regularPrice,
      salePrice: v.salePrice,
      onSale: v.onSale,
      stockStatus: v.stockStatus,
      image: { src: v.image.src },
      attributes: v.attributes,
    })),
  };
}

function StockSkeleton() {
  return <Skeleton className="h-5 w-24" />;
}

export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  const params: { slug: string[] }[] = [];

  // Cap build-time PDP seeding for large catalogs. Remaining products still
  // render on demand via `'use cache'` + Instant Navigation prefetch.
  // Override with HEADKIT_PRERENDER_PRODUCT_LIMIT (0 = unlimited).
  const limitRaw = process.env.HEADKIT_PRERENDER_PRODUCT_LIMIT;
  const productLimit =
    limitRaw === undefined || limitRaw === ""
      ? 150
      : Number.parseInt(limitRaw, 10);
  const unlimited = productLimit === 0;
  const maxProducts = Number.isFinite(productLimit)
    ? Math.max(0, productLimit)
    : 150;

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await headkit.products.list({}, page, 100);
      for (const product of result.products) {
        if (!unlimited && params.length >= maxProducts) {
          hasMore = false;
          break;
        }
        params.push({ slug: [product.slug] });
        // Colorway URLs are warmable via InstantLink prefetch; skip exploding
        // the static param set for large catalogs.
      }
      if (!unlimited && params.length >= maxProducts) break;
      hasMore = page < result.totalPages;
      page++;
    }
  } catch {
    /* Catalog API unreachable at build — fall through to the placeholder. */
  }

  if (params.length > 0) return params;
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const productSlug = slug[0]!;
  const colorSlug = slug[1]; // undefined for simple/base; a color slug for a colorway URL

  // Build-time placeholder param (API was unreachable during SSG): never a real
  // product, so emit empty metadata rather than hitting the backend.
  if (productSlug === STATIC_GEN_PLACEHOLDER_SLUG) return {};

  try {
    const [product, { seoSettings, storeSettings }, { iconUrl }] =
      await Promise.all([
        getCachedProduct(productSlug),
        getBranding(),
        getBrandingAssets(),
      ]);
    if (!product) {
      return { robots: { index: false, follow: false } };
    }

    const desc = product.shortDescription || product.description;
    const baseCanonical = `${SITE_URL}/products/${productSlug}`;
    const brandingOpts = {
      storeName: storeSettings.name ?? undefined,
      dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
      brandingIconUrl: iconUrl ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
    } as const;

    // Base product URL (no color in path): self-canonical, index in prod (S2).
    if (!colorSlug) {
      return makeSeoMetadata(product.seo ?? null, {
        title: product.name,
        canonical: baseCanonical,
        ...(desc ? { description: desc } : {}),
        ...brandingOpts,
      });
    }

    // Colorway URL: resolve the color attribute + its valid option slugs/labels.
    const colorAttr = product.attributes.find((a) => isColorAttrSlug(a.slug));
    const colorOption = colorAttr?.fullOptions.find(
      (opt) => opt.slug === colorSlug,
    );

    // Invalid color path (not a real variation option) → noindex junk URL.
    if (!colorOption) {
      return { robots: { index: false, follow: false } };
    }

    // Valid colorway: own title (Name – Color), self-canonical (S1), variant OG.
    const variation = product.variations.find((v) =>
      v.attributes.some((a) => isColorAttrSlug(a.key) && a.value === colorSlug),
    );
    const ogImage = variation?.image?.src ?? product.image?.src;

    return makeSeoMetadata(product.seo ?? null, {
      title: `${product.name} – ${colorOption.name}`,
      canonical: `${baseCanonical}/${colorSlug}`,
      ...(ogImage ? { ogImage } : {}),
      ...(desc ? { description: desc } : {}),
      ...brandingOpts,
    });
  } catch {
    return { robots: { index: false, follow: false } };
  }
}

/**
 * Instant Navigation (Next.js 16.3): keep the route segment sync so Partial
 * Prefetching can ship an App Shell immediately. Awaiting `params` / product
 * data in the default export blocks the shell (and is a known Partial
 * Prefetching footgun). Stream via Suspense; `'use cache'` product reads can
 * still pop in early when links use `prefetch={true}`.
 *
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function ProductPage({ params }: Props) {
  return (
    <Suspense fallback={<ProductPageShell />}>
      <ProductPageContent params={params} />
    </Suspense>
  );
}

async function ProductPageContent({ params }: Props) {
  const { slug } = await params;
  const productSlug = slug[0]!;
  const colorSlug = slug[1]; // undefined for simple products or base variable URL

  // Build-time placeholder param (see generateStaticParams) is never served.
  if (productSlug === STATIC_GEN_PLACEHOLDER_SLUG) {
    notFound();
  }

  const [product, { storeSettings }] = await Promise.all([
    getCachedProduct(productSlug),
    getBranding(),
  ]);

  if (!product) {
    notFound();
  }

  const brandName = resolveStoreName(storeSettings.name);
  const relatedAsProducts = product.related.map(mapRelatedToProduct);
  const upsellsAsProducts = product.upsells.map(mapRelatedToProduct);
  const featuredProjects = (product.projects ??
    []) as ProjectSummaryFieldsFragment[];

  const breadcrumbs = [
    { name: "Home", href: "/" },
    SHOP_BREADCRUMB,
    ...(product.categories?.length
      ? [
          {
            name: product.categories[0]!.name,
            href: `/collections/${product.categories[0]!.slug}`,
          },
        ]
      : []),
    {
      name: product.name,
      href: colorSlug
        ? `/products/${product.slug}/${colorSlug}`
        : `/products/${product.slug}`,
    },
  ];

  const breadcrumbItems = breadcrumbs.map((b, i) => ({
    name: b.name,
    uri: b.href,
    current: i === breadcrumbs.length - 1,
  }));

  const stockSlot = (
    <Suspense fallback={<StockSkeleton />}>
      <ProductStock
        productSlug={productSlug}
        {...(colorSlug !== undefined ? { colorSlug } : {})}
      />
    </Suspense>
  );

  return (
    <div>
      <ProductJsonLD product={product} brandName={brandName} />
      <BreadcrumbJsonLD items={breadcrumbs} />

      <div className="px-5 py-8 md:px-10">
        <ProductDetail
          product={product}
          {...(colorSlug !== undefined ? { initialColor: colorSlug } : {})}
          productBasePath={`/products/${productSlug}`}
          breadcrumbItems={breadcrumbItems}
          stockSlot={stockSlot}
        />
      </div>

      {featuredProjects.length > 0 ? (
        <section className="overflow-hidden py-10">
          <SectionHeader
            title="Featured in projects"
            description="See this product in real projects."
            allButton="View All"
            allButtonPath="/projects"
            className="px-5 md:px-10"
          />
          <div className="mt-5">
            <ProjectCarousel projects={featuredProjects} imageAspect="video" />
          </div>
        </section>
      ) : null}

      {upsellsAsProducts.length > 0 && (
        <section className="overflow-x-clip py-10">
          <SectionHeader
            title="You might also like…"
            description=""
            className="px-5 md:px-10"
          />
          <div className="mt-5">
            <ProductCarousel
              products={upsellsAsProducts}
              id="upsell-products"
            />
          </div>
        </section>
      )}

      {relatedAsProducts.length > 0 && (
        <section className="overflow-x-clip py-10">
          <SectionHeader
            title="Something similar"
            description=""
            className="px-5 md:px-10"
          />
          <div className="mt-5">
            <ProductCarousel
              products={relatedAsProducts}
              id="related-products"
            />
          </div>
        </section>
      )}
    </div>
  );
}
