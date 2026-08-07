import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { Suspense } from "react";
import { notFound } from "next/navigation";
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
import { makeSeoMetadata, resolveStoreName } from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import { TAG } from "@/lib/cache-tags";
import { decodeHtmlEntities } from "@/lib/utils";

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
    projects: [],
    isGiftCard: false,
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
    return makeSeoMetadata(project.seo, {
      title: project.title,
      ...(project.excerpt ? { description: project.excerpt } : {}),
      storeName: storeSettings.name ?? undefined,
      dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
      brandingIconUrl: iconUrl ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
    });
  } catch {
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
    const metaBits = [
      project.brand?.name ? decodeHtmlEntities(project.brand.name) : null,
      project.location ? decodeHtmlEntities(project.location) : null,
    ].filter(Boolean);

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
          url={`${(process.env.NEXT_PUBLIC_FRONTEND_URL ?? "").replace(/\/$/, "")}/projects/${projectSlug}`}
        />
        <BreadcrumbJsonLD items={breadcrumbs} />

        <div>
          <FeaturedImageHeader
            title={project.title}
            image={project.featuredImage?.src ?? null}
          />

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
            <div className="overflow-hidden py-[30px] lg:pb-[30px] lg:pt-[60px]">
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
