import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { notFound, unstable_rethrow } from "next/navigation";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { FeaturedImageHeader } from "@/components/headkit-ui/post/featured-image-header";
import { PostBody } from "@/components/headkit-ui/post/post-body";
import { PostCarousel } from "@/components/headkit-ui/post/post-carousel";
import { SectionHeader } from "@/components/headkit-ui/section-header";
import { ArticleJsonLD } from "@/components/seo/article-json-ld";
import { BreadcrumbJsonLD } from "@/components/seo/breadcrumb-json-ld";
import { CarouselPostJsonLD } from "@/components/seo/carousel-post-json-ld";
import { Skeleton } from "@/components/ui/skeleton";
import {
  makeSeoMetadata,
  resolveStoreName,
  storefrontUrl,
} from "@/lib/make-metadata";
import { getBranding, getBrandingAssets } from "@/lib/branding";
import {
  getPostsBasePath,
  postsArticlePath,
  postsIndexPath,
} from "@/lib/posts-base-path";

interface Props {
  params: Promise<{ slug: string[] }>;
}

function NewsArticleSkeleton(): ReactNode {
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
        <Skeleton animated={false} className="h-4 w-4/5" />
      </div>
    </div>
  );
}

/**
 * Satisfies Cache Components: `generateStaticParams` must not return [].
 * @see https://nextjs.org/docs/messages/blocking-route#generatestaticparams
 */
const STATIC_GEN_PLACEHOLDER_SLUG = "__hk_static_placeholder";

/**
 * REQUIRED for the 404 gate below to be able to set a status at all, which is
 * why a route with nothing to prerender still declares one.
 *
 * Measured on a Next 16.3 production build with `cacheComponents: true`: a
 * dynamic segment with NO `generateStaticParams` is served from a fully
 * POSTPONED prerendered shell (`x-nextjs-prerender: 1`,
 * `x-nextjs-postponed: 1`), so the 200 is committed by the shell before the
 * page component runs and the hoisted `notFound()` can only add a `noindex`
 * meta. Adding this made `/news/{missing}` answer 404 with no other change —
 * the sibling routes that already 404ed all declared one. It is a FOURTH
 * boundary source alongside the in-page `<Suspense>`, a `loading.tsx` and an
 * ancestor-layout boundary; `app/not-found-status.test.ts` asserts it.
 *
 * Posts are not enumerated (the catalogue is unbounded and cheap to stream), so
 * this emits only the placeholder — exactly as `app/client/[...slug]` does.
 */
export async function generateStaticParams(): Promise<{ slug: string[] }[]> {
  return [{ slug: [STATIC_GEN_PLACEHOLDER_SLUG] }];
}

async function getPost(postSlug: string) {
  "use cache";
  cacheLife("days");
  cacheTag(`headkit:post:${postSlug}`, "headkit:posts");
  return sdk.content.get(postSlug, "POST");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const postSlug = slug[slug.length - 1];
  if (!postSlug || postSlug === STATIC_GEN_PLACEHOLDER_SLUG) return {};
  try {
    const [post, { seoSettings, storeSettings }, { iconUrl }, postsBase] =
      await Promise.all([
        getPost(postSlug),
        getBranding(),
        getBrandingAssets(),
        getPostsBasePath(),
      ]);
    if (!post) return {};
    const path = postsArticlePath(postsBase, postSlug);
    return await makeSeoMetadata(post.seo, {
      title: post.title,
      ...(post.excerpt ? { description: post.excerpt } : {}),
      storeName: storeSettings.name ?? undefined,
      dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
      brandingIconUrl: iconUrl ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: storefrontUrl(path, storeSettings.domain),
      siteUrl: storeSettings.domain,
    });
  } catch (error) {
    unstable_rethrow(error);
    // The content component lets the same failure throw, which renders
    // `app/error.tsx` at HTTP 200 — an indexable status. Returning `{}` here
    // let that body inherit the store's indexable default, where the late
    // `notFound()` it replaced got Next's own injected `noindex`. A post
    // that EXISTS must never be offered to crawlers as an error page.
    return { robots: { index: false, follow: false } };
  }
}

/**
 * Blocking route so `notFound()` can still set a real 404: under Cache
 * Components the response commits as 200 the moment a `<Suspense>` fallback
 * renders, and a `notFound()` raised inside the boundary only earns a `noindex`
 * meta tag. The existence check therefore runs in the default export, above the
 * boundary, forfeiting this route's App Shell. What that costs, what else can
 * commit the 200 first, and why `instant` is NOT one of those things live once
 * in "Setting a status code needs THREE conditions" in `apps/starter/AGENTS.md`.
 * `instant = false` is that section's declaration rule: this route blocks on a
 * cached read before it responds.
 */
export const instant = false;

export default async function Page(props: Props): Promise<ReactNode> {
  // Pre-commit gate — an unknown post slug must answer 404. The `"use cache"`
  // post read dedupes with `NewsArticleContent`'s own read below.
  const { slug } = await props.params;
  const postSlug = slug[slug.length - 1];
  if (!postSlug || postSlug === STATIC_GEN_PLACEHOLDER_SLUG) notFound();
  if (!(await getPost(postSlug))) notFound();

  return (
    <Suspense fallback={<NewsArticleSkeleton />}>
      <NewsArticleContent {...props} />
    </Suspense>
  );
}

async function NewsArticleContent({ params }: Props): Promise<ReactNode> {
  const { slug } = await params;
  const postSlug = slug[slug.length - 1];
  if (!postSlug || postSlug === STATIC_GEN_PLACEHOLDER_SLUG) return notFound();

  // Deliberately UNCAUGHT, and the reason is NOT the status code. This
  // component runs BELOW the `<Suspense>` that already committed the 200, so
  // neither a `notFound()` nor a thrown error can set a status here — both
  // answer 200. What changes is the BODY and its robots meta: a late
  // `notFound()` tells a shopper this post does not exist when the gate in
  // the default export just proved it does, while a throw renders
  // `app/error.tsx`, is loggable, and commits no wrong content as the page.
  // `generateMetadata`'s catch marks that render `noindex` so the error body
  // is never offered to a crawler. The miss case is the null below, owned
  // jointly with that gate.
  const [post, { storeSettings }, postsBase, landing] = await Promise.all([
    getPost(postSlug),
    getBranding(),
    getPostsBasePath(),
    sdk.posts.getLanding().catch(() => null),
  ]);
  if (!post) return notFound();

  const related = post.relatedPosts ?? [];
  const siteName = resolveStoreName(storeSettings.name);
  const indexPath = postsIndexPath(postsBase);
  const articlePath = postsArticlePath(postsBase, postSlug);
  const postsLabel = landing?.title?.trim() || "News";

  const breadcrumbs = [
    { name: "Home", href: "/" },
    { name: postsLabel, href: indexPath },
    { name: post.title, href: articlePath },
  ];

  return (
    <>
      <ArticleJsonLD
        seo={post.seo}
        siteName={siteName}
        datePublished={post.date ?? undefined}
        dateModified={post.modified ?? undefined}
        image={post.featuredImage?.src}
        url={storefrontUrl(articlePath, storeSettings.domain)}
      />
      <BreadcrumbJsonLD items={breadcrumbs} />
      {related.length > 0 && <CarouselPostJsonLD posts={related} />}

      <div>
        <FeaturedImageHeader
          title={post.title}
          image={post.featuredImage?.src ?? null}
        />

        {/* HeadKit sections (callouts, etc.) hydrate via PostBody; leftover
              HTML keeps EditorialContent so .alignwide/.alignfull still work. */}
        <PostBody html={post.content ?? ""} />

        {related.length > 0 && (
          <div className="overflow-hidden py-[30px] lg:pt-[60px] lg:pb-[30px]">
            <SectionHeader
              title={`Latest ${postsLabel}`}
              description="Get the latest news and updates from our blog."
              allButton="View All"
              allButtonPath={indexPath}
              className="px-5 md:px-10"
            />
            <div className="mt-5">
              <PostCarousel posts={related} postsBasePath={postsBase} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}
