import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { PostHeader } from "@/components/headkit-ui/post/post-header";
import { ProjectPage } from "@/components/headkit-ui/project/project-page";
import { EditorialGridSkeleton } from "@/components/headkit-ui/skeletons/editorial-grid-skeleton";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { getBranding } from "@/lib/branding";
import { TAG } from "@/lib/cache-tags";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";
const FALLBACK_TITLE = "Projects";
const FALLBACK_DESCRIPTION = "Explore our latest projects and case studies.";
const PER_PAGE = 24;

async function getProjectsLanding() {
  "use cache";
  cacheLife("days");
  // Interim: CMS intro page must use slug "projects" (see ENG-860 for Reading picker).
  cacheTag(TAG.page("projects"), TAG.projects, TAG.pages);
  return sdk.content.get("projects", "PAGE").catch(() => null);
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [page, { seoSettings, storeSettings }] = await Promise.all([
      getProjectsLanding(),
      getBranding(),
    ]);
    return makeSeoMetadata(page?.seo ?? null, {
      title: page?.title?.trim() || FALLBACK_TITLE,
      description: page?.seo?.metaDesc?.trim() || FALLBACK_DESCRIPTION,
      storeName: storeSettings.name ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: SITE_URL
        ? `${SITE_URL.replace(/\/$/, "")}/projects`
        : "/projects",
    });
  } catch {
    return makeSeoMetadata(null, {
      title: FALLBACK_TITLE,
      description: FALLBACK_DESCRIPTION,
      canonical: SITE_URL
        ? `${SITE_URL.replace(/\/$/, "")}/projects`
        : "/projects",
    });
  }
}

interface Props {
  searchParams: Promise<Record<string, string>>;
}

async function getProjectFilters() {
  "use cache";
  cacheLife("days");
  cacheTag(TAG.projects);
  return sdk.projects.getFilters();
}

/**
 * Durable project list read — keyed on brand/tag/page. Public content, safe
 * for remote cache (mirrors collection `getCatalogPage`).
 */
async function getProjectsPage(brand: string, tag: string, page: number) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(TAG.projects, `projects:${brand || "all"}:${tag || "all"}:${page}`);
  return sdk.projects.list({
    page,
    perPage: PER_PAGE,
    ...(brand ? { brand } : {}),
    ...(tag ? { tag } : {}),
  });
}

async function ProjectsServer({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const activeBrand = sp.brand ?? "";
  const activeTag = sp.tag ?? "";
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;

  const [projectsResult, projectFilters] = await Promise.all([
    getProjectsPage(activeBrand, activeTag, page).catch(() => ({
      projects: [],
      page: 1,
      perPage: PER_PAGE,
      total: 0,
      totalPages: 0,
    })),
    getProjectFilters().catch(() => ({ brands: [], clients: [], tags: [] })),
  ]);

  return (
    <ProjectPage
      initialProjects={projectsResult.projects}
      projectFilters={projectFilters}
      activeBrand={activeBrand}
      activeTag={activeTag}
    />
  );
}

/**
 * Instant Navigation (Next.js 16.3) — sync App Shell + Suspense streaming.
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function Page({ searchParams }: Props): React.ReactElement {
  return (
    <Suspense
      fallback={
        <>
          <PostHeader
            name={FALLBACK_TITLE}
            description={FALLBACK_DESCRIPTION}
            breadcrumbs={[
              { name: "Home", uri: "/", current: false },
              { name: FALLBACK_TITLE, uri: "/projects", current: true },
            ]}
          />
          <EditorialGridSkeleton aspect="square" />
        </>
      }
    >
      <ProjectsLanding searchParams={searchParams} />
    </Suspense>
  );
}

async function ProjectsLanding({
  searchParams,
}: Props): Promise<React.ReactElement> {
  const page = await getProjectsLanding();
  const title = page?.title?.trim() || FALLBACK_TITLE;
  const content = page?.content?.trim();

  return (
    <>
      <PostHeader
        name={title}
        {...(content ? { content } : { description: FALLBACK_DESCRIPTION })}
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: title, uri: "/projects", current: true },
        ]}
      />
      <Suspense fallback={<EditorialGridSkeleton aspect="square" />}>
        <ProjectsServer searchParams={searchParams} />
      </Suspense>
    </>
  );
}
