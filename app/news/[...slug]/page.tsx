import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { notFound } from "next/navigation";
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

async function getPost(postSlug: string) {
  "use cache";
  cacheLife("days");
  cacheTag(`headkit:post:${postSlug}`, "headkit:posts");
  return sdk.content.get(postSlug, "POST");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const postSlug = slug[slug.length - 1];
  if (!postSlug) return {};
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
    return makeSeoMetadata(post.seo, {
      title: post.title,
      ...(post.excerpt ? { description: post.excerpt } : {}),
      storeName: storeSettings.name ?? undefined,
      dashboardOgImageUrl: seoSettings.ogImageUrl ?? undefined,
      brandingIconUrl: iconUrl ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: storefrontUrl(path, storeSettings.domain),
      siteUrl: storeSettings.domain,
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
    <Suspense fallback={<NewsArticleSkeleton />}>
      <NewsArticleContent {...props} />
    </Suspense>
  );
}

async function NewsArticleContent({ params }: Props): Promise<ReactNode> {
  const { slug } = await params;
  const postSlug = slug[slug.length - 1];
  if (!postSlug) return notFound();

  try {
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
  } catch {
    return notFound();
  }
}
