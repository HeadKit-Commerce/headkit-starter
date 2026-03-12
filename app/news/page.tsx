import type { Metadata } from "next";
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

export default async function Page({ searchParams }: Props) {
  const sp = await searchParams;
  const activeCategory = sp.category ?? "";

  const [postsResult, postFilters] = await Promise.all([
    sdk.posts.list({
      perPage: 12,
      ...(activeCategory ? { category: activeCategory } : {}),
    }),
    sdk.posts.getFilters(),
  ]);

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
      <PostPage
        initialPosts={postsResult.posts}
        postFilters={postFilters}
        activeCategory={activeCategory}
      />
    </>
  );
}
