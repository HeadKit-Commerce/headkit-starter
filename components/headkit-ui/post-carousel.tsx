"use client";

import { Carousel } from "@/components/headkit-ui/carousel";
import { PostCard } from "@/components/headkit-ui/post-card";
import type { Post } from "@headkit/sdk";

interface Props {
  posts: Pick<Post, "title" | "slug" | "featuredImage">[];
}

const PostCarousel = ({ posts }: Props) => {
  return (
    <Carousel
      items={posts}
      renderItem={(post) => (
        <PostCard
          title={post.title}
          image={post?.featuredImage?.src ?? ""}
          uri={post.slug}
        />
      )}
      className="w-full pb-8"
      showPagination={false}
    />
  );
};

export { PostCarousel };
