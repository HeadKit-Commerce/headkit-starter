import type { Metadata } from "next";
import { Suspense } from "react";
import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { PostHeader } from "@/components/headkit-ui/post/post-header";
import { PostPage } from "@/components/headkit-ui/post/post-page";

export const metadata: Metadata = {
  title: "News",
  alternates: {
    canonical: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/news`,
  },
};

interface Props {
  searchParams: Promise<Record<string, string>>;
}

async function getPostFilters() {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:posts");
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
    <PostPage
      initialPosts={postsResult.posts}
      postFilters={postFilters}
      activeCategory={activeCategory}
    />
  );
}

export default async function Page({ searchParams }: Props) {
  return (
    <>
      <PostHeader
        name="News"
        description="Stay up to date with our latest news and articles"
        breadcrumbs={[
          { name: "Home", uri: "/", current: false },
          { name: "News", uri: "/news", current: true },
        ]}
      />
      <Suspense>
        <PostsServer searchParams={searchParams} />
      </Suspense>
    </>
  );
}
