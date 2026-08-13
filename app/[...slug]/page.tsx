import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { makeSeoMetadata, seoFallbackDescription } from "@/lib/make-metadata";
import { TAG } from "@/lib/cache-tags";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { CmsPageBody } from "@/components/headkit-ui/cms-page-body";
import { Skeleton } from "@/components/ui/skeleton";

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
 * {slug} route + provider look up by path. Tagged `headkit:page:{slug}` (exact
 * page save) and `headkit:pages` (carousel/slide CPT + schedule boundary — WP
 * hydrates hero slides into page editorBlocks, so carousel edits must purge
 * every CMS page that may embed a hero). Finite `days` life so a missed
 * webhook self-heals in ~1 day (threat T-09.5-14). Keeps `.catch(() => null)`
 * so a genuinely missing page still `notFound()`s deterministically from an
 * uncached-safe null.
 */
export async function getPageData(
  contentSlug: string,
): Promise<Awaited<ReturnType<typeof sdk.content.get>> | null> {
  "use cache";
  cacheLife("days");
  cacheTag(TAG.page(contentSlug), TAG.pages);
  return sdk.content.get(contentSlug, "PAGE").catch(() => null);
}

/**
 * WordPress Reading → Posts page slug (e.g. "insights"). Nav often links here.
 * `proxy.ts` rewrites that slug onto the internal `/news` tree; this redirect
 * is a safety net when the proxy rewrite is skipped (base === news, or fetch
 * failure) and someone still hits the CMS catch-all for the Posts page.
 */
async function getPostsLandingSlug(): Promise<string | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(TAG.posts, TAG.pages);
  const landing = await sdk.posts.getLanding().catch(() => null);
  const slug = landing?.slug?.trim();
  return slug || null;
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

export default function Page({ params }: Props) {
  return (
    <Suspense
      fallback={
        <div className="min-h-[50vh] space-y-4 px-5 py-10 md:px-10">
          <Skeleton animated={false} className="h-4 w-40" />
          <Skeleton animated={false} className="h-10 w-64 max-w-full" />
          <Skeleton animated={false} className="h-4 w-full max-w-xl" />
          <Skeleton animated={false} className="h-4 w-full max-w-lg" />
        </div>
      }
    >
      <CmsRoute params={params} />
    </Suspense>
  );
}

/**
 * Instant Navigation (Next.js 16.3) — sync App Shell + Suspense streaming.
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

async function CmsRoute({ params }: Props) {
  const { slug } = await params;
  if (slug[0] === STATIC_GEN_PLACEHOLDER_SLUG) return notFound();
  const contentSlug = slug.join("/");

  // Posts page may use any WP slug (Insights, Blog, …). That page alone has no
  // post grid. `proxy.ts` normally rewrites the slug onto `/news` before this
  // catch-all runs; if that rewrite is skipped, send visitors to /news (ENG-558).
  const postsLandingSlug = await getPostsLandingSlug();
  if (
    postsLandingSlug &&
    contentSlug === postsLandingSlug &&
    postsLandingSlug !== "news"
  ) {
    permanentRedirect("/news");
  }

  const page = await getPageData(contentSlug);

  if (!page) return notFound();

  // BreadcrumbList JSON-LD (D-04 core type) built from the page slug/title.
  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: page.title, href: `/${slug.join("/")}` },
  ];

  // No outer px/my — CmsPageBody pads HTML/GF segments like the homepage and
  // leaves hero carousels full-bleed (`mx-5` inside MainCarousel). Outer
  // `px-5 md:px-10 my-10` previously double-inset carousels and left a gap
  // under the nav on pages like /hospitality.
  return (
    <div className="min-h-[50vh] overflow-hidden">
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
