"use client";

import { Carousel } from "@/components/headkit-ui/carousel";
import { PostCard } from "./post-card";
import type { Post, PostSummaryFieldsFragment } from "@headkit/sdk";

interface PostCarouselProps {
  posts: (PostSummaryFieldsFragment | Post)[];
}

export function PostCarousel({ posts }: PostCarouselProps) {
  return (
    <Carousel
      items={posts}
      renderItem={(post) => (
        <PostCard post={post as PostSummaryFieldsFragment} textStyle="dark" />
      )}
      className="w-full pb-8"
      showPagination={false}
    />
  );
}
