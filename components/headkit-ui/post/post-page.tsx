"use client";

import { useState } from "react";
import type { PostSummaryFieldsFragment, PostFilters } from "@headkit/sdk";
import { PostGrid } from "./post-grid";

interface PostPageProps {
  initialPosts: PostSummaryFieldsFragment[];
  postFilters?: PostFilters;
  activeCategory?: string;
}

export function PostPage({
  initialPosts,
  postFilters,
  activeCategory,
}: PostPageProps) {
  const [activeFilter, setActiveFilter] = useState(activeCategory ?? "");

  // Hide WordPress's default "Uncategorized" bucket from the filter row —
  // it is noise, not a real editorial category (F10). Posts that only have
  // it stay reachable via "All".
  const categories = (postFilters?.categories ?? []).filter(
    (c) => c.slug !== "uncategorized",
  );

  return (
    <div className="flex flex-col gap-8">
      {categories.length > 0 && (
        <div className="flex items-center gap-3 overflow-x-auto px-5 md:px-10 py-4 scrollbar-hide">
          <button
            onClick={() => setActiveFilter("")}
            className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeFilter === ""
                ? "bg-primary text-white"
                : "bg-gray-100 hover:bg-gray-200 text-gray-700"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveFilter(cat.slug)}
              className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeFilter === cat.slug
                  ? "bg-primary text-white"
                  : "bg-gray-100 hover:bg-gray-200 text-gray-700"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}
      <PostGrid
        posts={
          activeFilter
            ? initialPosts.filter((p) =>
                p.categories?.some((c) => c.slug === activeFilter),
              )
            : initialPosts
        }
      />
    </div>
  );
}
