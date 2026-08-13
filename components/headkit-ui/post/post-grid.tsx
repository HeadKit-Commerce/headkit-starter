import type { PostSummaryFieldsFragment } from "@headkit/sdk";
import { CATALOG_GRID_CLASS } from "@/components/headkit-ui/catalog-grid";
import { DEFAULT_POSTS_BASE_PATH } from "@/lib/posts-path";
import { PostCard } from "./post-card";

interface PostGridProps {
  posts: PostSummaryFieldsFragment[];
  /** Public posts base path (WP Posts page slug). */
  postsBasePath?: string;
}

export function PostGrid({
  posts,
  postsBasePath = DEFAULT_POSTS_BASE_PATH,
}: PostGridProps) {
  if (!posts.length) {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-20 text-center md:px-10">
        <p className="text-lg font-medium text-gray-900">No posts found</p>
        <p className="mt-2 text-sm text-gray-500">
          Try another category or check back soon.
        </p>
      </div>
    );
  }

  return (
    <div className="z-5 px-5 md:px-10">
      <div className={CATALOG_GRID_CLASS}>
        {posts.map((post, index) => (
          <PostCard
            key={post.id}
            post={post}
            postsBasePath={postsBasePath}
            priority={index < 2}
            {...(index >= 4
              ? {
                  className:
                    "[content-visibility:auto] [contain-intrinsic-size:auto_280px]",
                }
              : {})}
          />
        ))}
      </div>
    </div>
  );
}
