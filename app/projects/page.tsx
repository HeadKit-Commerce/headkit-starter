import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { PostHeader } from "@/components/headkit-ui/post/post-header";
import { ProjectPage } from "@/components/headkit-ui/project/project-page";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { getBranding } from "@/lib/branding";
import { TAG } from "@/lib/cache-tags";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";
const FALLBACK_TITLE = "Projects";
const FALLBACK_DESCRIPTION = "Explore our latest projects and case studies.";

async function getProjectsLanding() {
  "use cache";
  cacheLife("max");
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
  cacheLife("max");
  cacheTag(TAG.projects);
  return sdk.projects.getFilters();
}

async function ProjectsServer({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const activeBrand = sp.brand ?? "";
  const activeTag = sp.tag ?? "";

  const [projectsResult, projectFilters] = await Promise.all([
    sdk.projects.list({
      perPage: 12,
      ...(activeBrand ? { brand: activeBrand } : {}),
      ...(activeTag ? { tag: activeTag } : {}),
    }),
    getProjectFilters(),
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

export default async function Page({
  searchParams,
}: Props): Promise<React.ReactElement> {
  const page = await getProjectsLanding();
  const title = page?.title?.trim() || FALLBACK_TITLE;
  const content = page?.content?.trim();

  return (
    <>
      <PostHeader
        name={title}
        {...(content
          ? { content }
          : { description: FALLBACK_DESCRIPTION })}
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: title, uri: "/projects", current: true },
        ]}
      />
      <Suspense>
        <ProjectsServer searchParams={searchParams} />
      </Suspense>
    </>
  );
}
