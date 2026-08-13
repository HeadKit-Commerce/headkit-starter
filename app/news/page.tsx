import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { PostHeader } from "@/components/headkit-ui/post/post-header";
import { PostPage } from "@/components/headkit-ui/post/post-page";
import { EditorialGridSkeleton } from "@/components/headkit-ui/skeletons/editorial-grid-skeleton";
import { CarouselPostJsonLD } from "@/components/seo/carousel-post-json-ld";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { getBranding } from "@/lib/branding";
import { TAG } from "@/lib/cache-tags";
import { getPostsBasePath, postsIndexPath } from "@/lib/posts-base-path";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";
const FALLBACK_TITLE = "News";
const FALLBACK_DESCRIPTION =
  "Stay up to date with our latest news and articles.";
const PER_PAGE = 24;

async function getNewsLanding() {
  "use cache";
  cacheLife("hours");
  // Posts page may use any WP slug; always tag the storefront news route.
  cacheTag(TAG.page("news"), TAG.posts, TAG.pages);
  return sdk.posts.getLanding().catch(() => null);
}

function canonicalForPostsBase(base: string): string {
  const path = postsIndexPath(base);
  return SITE_URL ? `${SITE_URL.replace(/\/$/, "")}${path}` : path;
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [page, { seoSettings, storeSettings }, postsBase] = await Promise.all(
      [getNewsLanding(), getBranding(), getPostsBasePath()],
    );
    return makeSeoMetadata(page?.seo ?? null, {
      title: page?.title?.trim() || FALLBACK_TITLE,
      description: page?.seo?.metaDesc?.trim() || FALLBACK_DESCRIPTION,
      storeName: storeSettings.name ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: canonicalForPostsBase(postsBase),
    });
  } catch {
    return makeSeoMetadata(null, {
      title: FALLBACK_TITLE,
      description: FALLBACK_DESCRIPTION,
      canonical: canonicalForPostsBase("news"),
    });
  }
}

interface Props {
  searchParams: Promise<Record<string, string>>;
}

async function getPostFilters() {
  "use cache";
  cacheLife("days");
  cacheTag(TAG.posts);
  return sdk.posts.getFilters();
}

/**
 * Durable post list read — keyed on category + page. Public content, safe for
 * remote cache (mirrors collection `getCatalogPage`).
 */
async function getPostsPage(category: string, page: number) {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(TAG.posts, category ? `posts:cat:${category}` : "posts:all");
  return sdk.posts.list({
    page,
    perPage: PER_PAGE,
    ...(category ? { category } : {}),
  });
}

async function PostsServer({
  searchParams,
  postsBasePath,
}: {
  searchParams: Promise<Record<string, string>>;
  postsBasePath: string;
}) {
  const sp = await searchParams;
  const activeCategory = sp.category ?? "";
  const page = sp.page ? parseInt(sp.page, 10) || 1 : 1;

  const [postsResult, postFilters] = await Promise.all([
    getPostsPage(activeCategory, page).catch(() => ({
      posts: [],
      page: 1,
      perPage: PER_PAGE,
      total: 0,
      totalPages: 0,
    })),
    getPostFilters().catch(() => ({ categories: [] })),
  ]);

  return (
    <>
      {postsResult.posts.length > 0 && (
        <CarouselPostJsonLD posts={postsResult.posts} />
      )}
      <PostPage
        initialPosts={postsResult.posts}
        postFilters={postFilters}
        activeCategory={activeCategory}
        postsBasePath={postsBasePath}
      />
    </>
  );
}

/**
 * Instant Navigation (Next.js 16.3) — header can stream with posts under Suspense.
 * @see https://nextjs.org/docs/app/guides/instant-navigation
 */
export const instant = true;

export default function Page({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <>
          <PostHeader
            name={FALLBACK_TITLE}
            description={FALLBACK_DESCRIPTION}
            breadcrumbs={[
              { name: "Home", uri: "/", current: false },
              { name: FALLBACK_TITLE, uri: "/news", current: true },
            ]}
          />
          <EditorialGridSkeleton aspect="video" />
        </>
      }
    >
      <NewsRoute searchParams={searchParams} />
    </Suspense>
  );
}

async function NewsRoute({ searchParams }: Props) {
  const [page, postsBase] = await Promise.all([
    getNewsLanding(),
    getPostsBasePath(),
  ]);
  const title = page?.title?.trim() || FALLBACK_TITLE;
  const content = page?.content?.trim();
  const indexPath = postsIndexPath(postsBase);

  return (
    <>
      <PostHeader
        name={title}
        {...(content ? { content } : { description: FALLBACK_DESCRIPTION })}
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: title, uri: indexPath, current: true },
        ]}
      />
      <Suspense fallback={<EditorialGridSkeleton aspect="video" />}>
        <PostsServer
          searchParams={searchParams}
          postsBasePath={postsBase}
        />
      </Suspense>
    </>
  );
}
