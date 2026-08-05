import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import { FeaturedImageHeader } from "@/components/headkit-ui/post/featured-image-header";
import { ProjectCarousel } from "@/components/headkit-ui/project/project-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ArticleJsonLD } from "@/components/seo/article-json-ld";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { makeSeoMetadata, resolveStoreName } from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import { TAG } from "@/lib/cache-tags";
import { decodeHtmlEntities } from "@/lib/utils";

interface Props {
  params: Promise<{ slug: string[] }>;
}

async function getProject(projectSlug: string) {
  "use cache";
  cacheLife("max");
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

export default async function Page({
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

          {related.length > 0 ? (
            <div className="overflow-hidden px-5 py-[30px] md:px-10 lg:pb-[30px] lg:pt-[60px]">
              <SectionHeader
                title="Related Projects"
                description="More projects you may like."
                allButton="View All"
                allButtonPath="/projects"
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
