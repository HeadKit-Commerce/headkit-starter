"use client";

import { useRouter, usePathname } from "next/navigation";
import type { PostSummaryFieldsFragment, PostFilters } from "@headkit/sdk";
import { decodeHtmlEntities } from "@/lib/utils";
import { PostGrid } from "./post-grid";

interface PostPageProps {
  initialPosts: PostSummaryFieldsFragment[];
  postFilters?: PostFilters;
  activeCategory?: string;
}

export function PostPage({
  initialPosts,
  postFilters,
  activeCategory = "",
}: PostPageProps) {
  const router = useRouter();
  const pathname = usePathname();

  // Hide WordPress's default "Uncategorized" bucket from the filter row —
  // it is noise, not a real editorial category (F10). Posts that only have
  // it stay reachable via "All".
  const categories = (postFilters?.categories ?? []).filter(
    (c) => c.slug !== "uncategorized",
  );

  const setCategory = (slug: string): void => {
    const params = new URLSearchParams();
    if (slug) params.set("category", slug);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="headkit-news-page flex flex-col gap-8">
      {categories.length > 0 && (
        <div className="flex items-center gap-3 overflow-x-auto px-5 py-4 scrollbar-hide md:px-10">
          <button
            type="button"
            onClick={() => setCategory("")}
            className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              activeCategory === ""
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              type="button"
              key={cat.id}
              onClick={() => setCategory(cat.slug)}
              className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                activeCategory === cat.slug
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {decodeHtmlEntities(cat.name)}
            </button>
          ))}
        </div>
      )}
      {/* Server already applied `?category=` — do not re-slice the first page. */}
      <PostGrid posts={initialPosts} />
    </div>
  );
}
