import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { PostHeader } from "@/components/headkit-ui/post/post-header";
import { PostPage } from "@/components/headkit-ui/post/post-page";
import { CarouselPostJsonLD } from "@/components/seo/carousel-post-json-ld";
import { makeSeoMetadata } from "@/lib/make-metadata";
import { getBranding } from "@/lib/branding";
import { TAG } from "@/lib/cache-tags";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";
const FALLBACK_TITLE = "News";
const FALLBACK_DESCRIPTION =
  "Stay up to date with our latest news and articles.";

async function getNewsLanding() {
  "use cache";
  cacheLife("max");
  // Posts page may use any WP slug; always tag the storefront news route.
  cacheTag(TAG.page("news"), TAG.posts, TAG.pages);
  return sdk.posts.getLanding().catch(() => null);
}

export async function generateMetadata(): Promise<Metadata> {
  try {
    const [page, { seoSettings, storeSettings }] = await Promise.all([
      getNewsLanding(),
      getBranding(),
    ]);
    return makeSeoMetadata(page?.seo ?? null, {
      title: page?.title?.trim() || FALLBACK_TITLE,
      description: page?.seo?.metaDesc?.trim() || FALLBACK_DESCRIPTION,
      storeName: storeSettings.name ?? undefined,
      allowIndexing: seoSettings.allowIndexing,
      canonical: SITE_URL ? `${SITE_URL.replace(/\/$/, "")}/news` : "/news",
    });
  } catch {
    return makeSeoMetadata(null, {
      title: FALLBACK_TITLE,
      description: FALLBACK_DESCRIPTION,
      canonical: SITE_URL ? `${SITE_URL.replace(/\/$/, "")}/news` : "/news",
    });
  }
}

interface Props {
  searchParams: Promise<Record<string, string>>;
}

async function getPostFilters() {
  "use cache";
  cacheLife("max");
  cacheTag(TAG.posts);
  return sdk.posts.getFilters();
}

async function PostsServer({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const sp = await searchParams;
  const activeCategory = sp.category ?? "";

  const [postsResult, postFilters] = await Promise.all([
    sdk.posts.list({
      perPage: 12,
      ...(activeCategory ? { category: activeCategory } : {}),
    }),
    getPostFilters(),
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
      />
    </>
  );
}

export default async function Page({ searchParams }: Props) {
  const page = await getNewsLanding();
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
          { name: title, uri: "/news", current: true },
        ]}
      />
      <Suspense>
        <PostsServer searchParams={searchParams} />
      </Suspense>
    </>
  );
}
