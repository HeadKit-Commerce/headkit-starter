import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { Suspense } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import type { Product, RelatedProduct } from "@headkit/sdk";
import { headkit as sdk } from "@/lib/sdk";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import { FeaturedImageHeader } from "@/components/headkit-ui/post/featured-image-header";
import { ProductCarousel } from "@/components/headkit-ui/product-carousel";
import { ProjectCarousel } from "@/components/headkit-ui/project/project-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ArticleJsonLD } from "@/components/seo/article-json-ld";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { Skeleton } from "@/components/ui/skeleton";
import {
  makeSeoMetadata,
  resolveStoreName,
  storefrontUrl,
} from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import { TAG } from "@/lib/cache-tags";
import { decodeHtmlEntities } from "@/lib/utils";
import { InstantLink } from "@/components/headkit-ui/instant-link";

interface Props {
  params: Promise<{ slug: string[] }>;
}

function ProjectArticleSkeleton(): ReactNode {
  return (
    <div className="space-y-6 px-5 py-8 md:px-10">
      <Skeleton animated={false} className="h-4 w-40" />
      <Skeleton animated={false} className="h-10 w-2/3 max-w-xl" />
      <Skeleton
        animated={false}
        className="aspect-[16/9] w-full max-w-4xl rounded-brand"
      />
      <div className="max-w-3xl space-y-3">
        <Skeleton animated={false} className="h-4 w-full" />
        <Skeleton animated={false} className="h-4 w-full" />
        <Skeleton animated={false} className="h-4 w-11/12" />
      </div>
    </div>
  );
}

function mapRelatedToProduct(r: RelatedProduct): Product {
  return {
    id: r.id,
    name: r.name,
    slug: r.slug,
    // WooCommerce's own permalink, so a project's product card resolves the
    // same canonical path the PDP, the JSON-LD and the sitemap do (see
    // `lib/canonical-path.ts`). A synthesised `/products/{slug}` here would
    // link the shape that 308s.
    uri: r.permalink,
    isNew: r.isNew,
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
    hoverImage: r.hoverImage ?? null,
    images: r.image ? [r.image] : [],
    categories: [],
    tags: [],
    attributes: r.attributes ?? [],
    defaultAttributes: r.defaultAttributes ?? [],
    variations: r.variations ?? [],
    related: [],
    averageRating: "0",
    reviewCount: 0,
    reviewsEnabled: false,
    specifications: null,
    brands: [],
    crossSells: [],
    upsells: [],
    projects: [],
    isGiftCard: false,
    // A related-product summary carries no add-on definitions; the empty list is
    // the same shape a store without the Product Add-Ons extension produces.
    addons: [],
  };
}

async function getProject(projectSlug: string) {
  "use cache";
  cacheLife("days");
  cacheTag(TAG.project(projectSlug), TAG.projects);
  return sdk.projects.get(projectSlug);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const projectSlug = slug[slug.length - 1];
  if (!projectSlug) return {};
  try {
    const [project, { seoSettings, storeSettings }, { iconUrl }] =
      await Promise.all([
        getProject(projectSlug),
        getBranding(),
        getBrandingAssets(),
      ]);
    if (!project) return {};
    return await makeSeoMetadata(project.seo, {
      title: project.title,
      ...(project.excerpt ? { description: project.excerpt } : {}),
      storeName: storeSettings.name ?? undefined,
      dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
      brandingIconUrl: iconUrl ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: storefrontUrl(
        `/projects/${projectSlug}`,
        storeSettings.domain,
      ),
      siteUrl: storeSettings.domain,
    });
  } catch (error) {
    unstable_rethrow(error);
    return {};
  }
}

/**
 * Instant Navigation (Next.js 16.3) — sync App Shell + Suspense streaming.
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function Page(props: Props): ReactNode {
  return (
    <Suspense fallback={<ProjectArticleSkeleton />}>
      <ProjectArticleContent {...props} />
    </Suspense>
  );
}

async function ProjectArticleContent({
  params,
}: Props): Promise<React.ReactElement> {
  const { slug } = await params;
  const projectSlug = slug[slug.length - 1];
  if (!projectSlug) return notFound();

  try {
    const [project, { storeSettings }] = await Promise.all([
      getProject(projectSlug),
      getBranding(),
    ]);
    if (!project) return notFound();

    const related = project.relatedProjects ?? [];
    const gallery = project.gallery ?? [];
    const projectProducts = (project.products ?? []).map(mapRelatedToProduct);
    const siteName = resolveStoreName(storeSettings.name);
    const brandNames =
      (project.brands?.length ?? 0) > 0
        ? (project.brands ?? [])
            .map((b) => decodeHtmlEntities(b.name))
            .filter(Boolean)
        : project.brand?.name
          ? [decodeHtmlEntities(project.brand.name)]
          : [];
    const metaBits = [
      ...brandNames,
      project.location ? decodeHtmlEntities(project.location) : null,
    ].filter(Boolean);
    const client = project.client;
    const clientName = client?.name ? decodeHtmlEntities(client.name) : null;
    const clientHref =
      client?.uri?.trim() || (client?.slug ? `/client/${client.slug}` : null);

    const breadcrumbs = [
      { name: "Home", href: "/" },
      { name: "Projects", href: "/projects" },
      { name: project.title, href: `/projects/${projectSlug}` },
    ];

    return (
      <>
        <ArticleJsonLD
          seo={project.seo}
          siteName={siteName}
          datePublished={project.date ?? undefined}
          dateModified={project.modified ?? undefined}
          image={project.featuredImage?.src}
          url={storefrontUrl(`/projects/${projectSlug}`, storeSettings.domain)}
        />
        <BreadcrumbJsonLD items={breadcrumbs} />

        <div>
          <FeaturedImageHeader
            title={project.title}
            image={project.featuredImage?.src ?? null}
          />

          {client?.thumbnail ? (
            <div className="flex items-center gap-3 px-5 pt-6 md:px-10">
              {clientHref ? (
                <InstantLink
                  href={clientHref}
                  className="relative block h-10 w-32"
                  aria-label={clientName ?? "Client"}
                >
                  <Image
                    src={client.thumbnail}
                    alt={clientName ?? "Client"}
                    fill
                    className="object-contain object-left"
                    sizes="128px"
                  />
                </InstantLink>
              ) : (
                <div className="relative h-10 w-32">
                  <Image
                    src={client.thumbnail}
                    alt={clientName ?? "Client"}
                    fill
                    className="object-contain object-left"
                    sizes="128px"
                  />
                </div>
              )}
            </div>
          ) : null}

          {metaBits.length > 0 ? (
            <p className="px-5 pt-4 text-sm text-muted-foreground md:px-10">
              {metaBits.join(" · ")}
            </p>
          ) : null}

          <div className="my-[40px] px-[20px] md:px-[40px]">
            <EditorialContent html={project.content ?? ""} />
          </div>

          {gallery.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 px-5 pb-10 sm:grid-cols-2 md:px-10 lg:grid-cols-3">
              {gallery.map((image, index) => (
                <div
                  key={`${image.src}-${index}`}
                  className="relative aspect-video overflow-hidden rounded-brand"
                >
                  <Image
                    src={image.src}
                    alt={image.alt || `${project.title} gallery ${index + 1}`}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
              ))}
            </div>
          ) : null}

          {projectProducts.length > 0 ? (
            <div className="overflow-x-clip py-[30px] lg:pb-[30px] lg:pt-[60px]">
              <SectionHeader
                title="Products in this project"
                description="Shop the products featured in this project."
                allButton="Shop All"
                allButtonPath="/shop"
                className="px-5 md:px-10"
              />
              <div className="mt-5">
                <ProductCarousel
                  products={projectProducts}
                  id="project-products"
                />
              </div>
            </div>
          ) : null}

          {related.length > 0 ? (
            <div className="overflow-hidden py-[30px] lg:pb-[30px] lg:pt-[60px]">
              <SectionHeader
                title="Related Projects"
                description="More projects you may like."
                allButton="View All"
                allButtonPath="/projects"
                className="px-5 md:px-10"
              />
              <div className="mt-5">
                <ProjectCarousel projects={related} />
              </div>
            </div>
          ) : null}
        </div>
      </>
    );
  } catch {
    return notFound();
  }
}
