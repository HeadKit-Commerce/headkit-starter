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

export async function generateMetadata(): Promise<Metadata> {
  try {
    const { seoSettings, storeSettings } = await getBranding();
    return makeSeoMetadata(null, {
      title: "Projects",
      description: "Explore our latest projects and case studies.",
      storeName: storeSettings.name ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: SITE_URL
        ? `${SITE_URL.replace(/\/$/, "")}/projects`
        : "/projects",
    });
  } catch {
    return makeSeoMetadata(null, {
      title: "Projects",
      description: "Explore our latest projects and case studies.",
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
  return (
    <>
      <PostHeader
        name="Projects"
        description="Explore our latest projects and case studies"
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "Projects", uri: "/projects", current: true },
        ]}
      />
      <Suspense>
        <ProjectsServer searchParams={searchParams} />
      </Suspense>
    </>
  );
}
