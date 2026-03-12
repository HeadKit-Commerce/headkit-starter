import type { PostSummaryFieldsFragment } from "@headkit/sdk";
import { PostCard } from "./post-card";

interface PostGridProps {
  posts: PostSummaryFieldsFragment[];
}

export function PostGrid({ posts }: PostGridProps) {
  if (!posts.length) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-lg text-gray-500">No posts found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3 px-5 md:px-10">
      {posts.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}
