import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { makeSeoMetadata, seoFallbackDescription } from "@/lib/make-metadata";
import { TAG } from "@/lib/cache-tags";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";

interface Props {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<Record<string, string>>;
}

/**
 * Params-safe cached CMS read. The slug is joined + passed in as a PLAIN STRING
 * by the caller (`Page`/`generateMetadata`), which read `params` OUTSIDE this
 * cached scope — a `use cache` fn must never touch `params`/`searchParams`/
 * `cookies` (threat T-09.5-15, the 50s cache-fill build hang). `content()`
 * resolves PAGE by bare slug/path (no leading slash) — the WP /content/page/
 * {slug} route + provider look up by path. Tagged `headkit:page:{slug}` at a
 * finite `days` life so a WP `page:{slug}` edit invalidates exactly this page
 * and a missed webhook self-heals in ~1 day (threat T-09.5-14). Keeps
 * `.catch(() => null)` so a genuinely missing page still `notFound()`s
 * deterministically from an uncached-safe null.
 */
export async function getPageData(
  contentSlug: string,
): Promise<Awaited<ReturnType<typeof sdk.content.get>> | null> {
  "use cache";
  cacheLife("days");
  cacheTag(TAG.page(contentSlug));
  return sdk.content.get(contentSlug, "PAGE").catch(() => null);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = await getPageData(slug.join("/"));
  if (!page) {
    return { robots: { index: false, follow: false } };
  }
  // Real Yoast SEOData wins; when absent, emit a TEMPLATED page default
  // (title + per-entity description) rather than the old noindex-only
  // parent fallback — D-04 mandates a sane SEO floor, not a suppressed page.
  return makeSeoMetadata(page.seo ?? null, {
    title: page.title,
    description: seoFallbackDescription("page", page.title),
  });
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = await getPageData(slug.join("/"));

  if (!page) return notFound();

  // BreadcrumbList JSON-LD (D-04 core type) built from the page slug/title.
  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: page.title, href: `/${slug.join("/")}` },
  ];

  return (
    <div className="px-5 md:px-10 my-10 min-h-[50vh]">
      <BreadcrumbJsonLD items={breadcrumbItems} />
      <h1 className="font-extrabold text-3xl text-primary">{page.title}</h1>
      {/* Full-width symmetric wrapper: EditorialContent centers its own blocks
          at content width; .alignwide/.alignfull break out from viewport centre. */}
      <div className="mt-5">
        <EditorialContent html={page.content} />
      </div>
    </div>
  );
}
