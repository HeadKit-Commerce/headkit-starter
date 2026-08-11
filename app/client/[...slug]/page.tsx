import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { ProjectGrid } from "@/components/headkit-ui/project/project-grid";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { Skeleton } from "@/components/ui/skeleton";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import { TAG } from "@/lib/cache-tags";
import { decodeHtmlEntities } from "@/lib/utils";

/**
 * Satisfies Cache Components: `generateStaticParams` must not return [].
 * @see https://nextjs.org/docs/messages/blocking-route#generatestaticparams
 */
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

interface Props {
  params: Promise<{ slug: string[] }>;
}

function ClientPageSkeleton(): ReactNode {
  return (
    <div className="space-y-8 px-5 py-10 md:px-10">
      <Skeleton animated={false} className="mx-auto h-16 w-48" />
      <Skeleton animated={false} className="mx-auto h-8 w-64" />
      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            animated={false}
            className="aspect-[4/3] w-full rounded-brand"
          />
        ))}
      </div>
    </div>
  );
}

async function getClient(clientSlug: string) {
  "use cache";
  cacheLife("days");
  cacheTag(TAG.client(clientSlug), TAG.clients, TAG.projects);
  return sdk.clients.get(clientSlug);
}

export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const clientSlug = slug[slug.length - 1];
  if (!clientSlug || clientSlug === STATIC_GEN_PLACEHOLDER_SLUG) return {};
  try {
    const [client, { seoSettings, storeSettings }, { iconUrl }] =
      await Promise.all([
        getClient(clientSlug),
        getBranding(),
        getBrandingAssets(),
      ]);
    if (!client) return {};
    return makeSeoMetadata(null, {
      title: decodeHtmlEntities(client.name),
      description: `Projects for ${decodeHtmlEntities(client.name)}`,
      storeName: storeSettings.name ?? undefined,
      brandingIconUrl: iconUrl ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
    });
  } catch {
    return {};
  }
}

export const instant = true;

export default function Page(props: Props): ReactNode {
  return (
    <Suspense fallback={<ClientPageSkeleton />}>
      <ClientPageContent {...props} />
    </Suspense>
  );
}

async function ClientPageContent({
  params,
}: Props): Promise<React.ReactElement> {
  const { slug } = await params;
  const clientSlug = slug[slug.length - 1];
  if (!clientSlug || clientSlug === STATIC_GEN_PLACEHOLDER_SLUG) {
    return notFound();
  }

  try {
    const client = await getClient(clientSlug);
    if (!client) return notFound();

    const name = decodeHtmlEntities(client.name);
    const projects = client.projects ?? [];
    const breadcrumbs = [
      { name: "Home", href: "/" },
      { name: "Projects", href: "/projects" },
      { name, href: `/client/${clientSlug}` },
    ];

    return (
      <>
        <BreadcrumbJsonLD items={breadcrumbs} />
        <div className="overflow-hidden py-10 lg:py-16">
          <div className="flex flex-col items-center gap-6 px-5 md:px-10">
            {client.thumbnail ? (
              <div className="relative h-16 w-48">
                <Image
                  src={client.thumbnail}
                  alt={name}
                  fill
                  className="object-contain object-center"
                  sizes="192px"
                  priority
                />
              </div>
            ) : null}
            <SectionHeader
              title={name}
              description={
                projects.length === 1
                  ? "1 project"
                  : `${projects.length} projects`
              }
              className="text-center"
            />
          </div>
          <div className="mt-10">
            <ProjectGrid projects={projects} />
          </div>
        </div>
      </>
    );
  } catch {
    return notFound();
  }
}
