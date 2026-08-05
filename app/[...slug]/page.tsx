import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { makeSeoMetadata, seoFallbackDescription } from "@/lib/make-metadata";
import { TAG } from "@/lib/cache-tags";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { CmsPageBody } from "@/components/headkit-ui/cms-page-body";

/** Satisfies Cache Components: `generateStaticParams` must not return []. */
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

/**
 * Common CMS page slugs to probe at build. Existing pages are prerendered into
 * the CDN HTML shell (FAQ-like instant paint). Without this list + with a
 * segment `loading.tsx`, Cache Components seals the skeleton as the shell and
 * every HIT flashes loading UI before streamed content — even when
 * `getPageData` is warm in `"use cache"`.
 */
const PRERENDER_PAGE_CANDIDATES = [
  "services",
  "about",
  "shipping",
  "returns",
  "privacy",
  "terms",
  "warranty",
  "care",
  "contact-us",
  "our-story",
  "delivery",
  "payment",
  "size-guide",
  "sustainability",
  "trade",
  "commercial",
] as const;

interface Props {
  params: Promise<{ slug: string[] }>;
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

/**
 * Prerender known CMS pages so their HTML shell contains real content (not a
 * loading skeleton). Candidates that 404 at build are skipped; Cache Components
 * still requires ≥1 param so we fall back to a placeholder.
 */
export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  try {
    const results = await Promise.all(
      PRERENDER_PAGE_CANDIDATES.map(async (slug) => {
        const page = await sdk.content.get(slug, "PAGE").catch(() => null);
        return page ? { slug: slug.split("/") } : null;
      }),
    );
    const paths = results.filter((p): p is { slug: string[] } => p !== null);
    if (paths.length > 0) return paths;
  } catch {
    /* API unreachable at build — fall through */
  }
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) {
    return { robots: { index: false, follow: false } };
  }
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
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) return notFound();
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
      <CmsPageBody
        title={page.title}
        html={page.content}
        editorBlocks={
          (page.editorBlocks ?? []) as Array<{
            products?: unknown[];
            attrs?: Record<string, unknown> | null;
            queryType?: string | null;
          }>
        }
      />
    </div>
  );
}
