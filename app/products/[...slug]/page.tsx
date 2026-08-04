import { notFound } from "next/navigation";
import { Suspense } from "react";
import type { Metadata } from "next";
import type { Product, RelatedProduct } from "@headkit/sdk";
import { headkit } from "@/lib/sdk";
import { getCachedProduct } from "@/lib/product-cache";
import { ProductDetail } from "@/components/headkit-ui/product-detail";
import { ProductStock } from "@/components/headkit-ui/product-stock";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
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

function mapRelatedToProduct(r: RelatedProduct): Product {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    uri: `/products/${r.slug}`,
    isNew: false,
    description: "",
    shortDescription: "",
    price: r.price,
    regularPrice: r.regularPrice,
    salePrice: r.salePrice,
    onSale: r.onSale,
    available: r.stockStatus?.toLowerCase() !== "outofstock",
    sku: "",
    type: r.type,
    stockStatus: r.stockStatus,
    stockQuantity: null,
    permalink: r.permalink,
    image: r.image ?? null,
    images: r.image ? [r.image] : [],
    categories: [],
    tags: [],
    attributes: r.attributes ?? [],
    variations: r.variations ?? [],
    related: [],
    averageRating: "0",
    reviewCount: 0,
    brands: [],
    crossSells: [],
    upsells: [],
    isGiftCard: false,
  };
}

function StockSkeleton() {
  return <Skeleton className="h-5 w-24" />;
}

export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  const params: { slug: string[] }[] = [];

  try {
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const result = await headkit.products.list({}, page, 100);
      for (const product of result.products) {
        params.push({ slug: [product.slug] });
        const colorAttr = product.attributes.find(
          (a) => a.slug === "pa_color" || a.slug === "pa_colour",
        );
        if (colorAttr) {
          for (const opt of colorAttr.fullOptions) {
            params.push({ slug: [product.slug, opt.slug] });
          }
        }
      }
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
 */
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
  const relatedAsProducts: Product[] = product.related.map(mapRelatedToProduct);
  const upsellsAsProducts: Product[] = product.upsells.map(mapRelatedToProduct);

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

      {upsellsAsProducts.length > 0 && (
        <section className="overflow-hidden py-10">
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
        <section className="overflow-hidden py-10">
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
