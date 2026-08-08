"use client";

import { useRouter, usePathname } from "next/navigation";
import type {
  ProjectSummaryFieldsFragment,
  ProjectFilters,
} from "@headkit/sdk";
import { ProjectGrid } from "./project-grid";

interface ProjectPageProps {
  initialProjects: ProjectSummaryFieldsFragment[];
  projectFilters?: ProjectFilters;
  activeBrand?: string;
  activeTag?: string;
}

export function ProjectPage({
  initialProjects,
  projectFilters,
  activeBrand = "",
  activeTag = "",
}: ProjectPageProps): React.ReactElement {
  const router = useRouter();
  const pathname = usePathname();

  const brands = projectFilters?.brands ?? [];
  const tags = projectFilters?.tags ?? [];

  const pushFilters = (next: {
    brand?: string;
    tag?: string;
  }): void => {
    const params = new URLSearchParams();
    const brand = "brand" in next ? (next.brand ?? "") : activeBrand;
    const tag = "tag" in next ? (next.tag ?? "") : activeTag;
    if (brand) params.set("brand", brand);
    if (tag) params.set("tag", tag);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div className="flex flex-col gap-8">
      {brands.length > 0 ? (
        <div className="flex items-center gap-3 overflow-x-auto px-5 py-4 scrollbar-hide md:px-10">
          <button
            type="button"
            onClick={() => pushFilters({ brand: "" })}
            className={`cursor-pointer whitespace-nowrap rounded-brand-button px-4 py-2 text-sm font-medium transition-colors ${
              activeBrand === ""
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All brands
          </button>
          {brands.map((brand) => (
            <button
              type="button"
              key={brand.id}
              onClick={() => pushFilters({ brand: brand.slug })}
              className={`cursor-pointer whitespace-nowrap rounded-brand-button px-4 py-2 text-sm font-medium transition-colors ${
                activeBrand === brand.slug
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {brand.name}
            </button>
          ))}
        </div>
      ) : null}

      {tags.length > 0 ? (
        <div className="flex items-center gap-3 overflow-x-auto px-5 pb-2 scrollbar-hide md:px-10">
          <button
            type="button"
            onClick={() => pushFilters({ tag: "" })}
            className={`cursor-pointer whitespace-nowrap rounded-brand-button px-4 py-2 text-sm font-medium transition-colors ${
              activeTag === ""
                ? "bg-primary text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All tags
          </button>
          {tags.map((tag) => (
            <button
              type="button"
              key={tag.id}
              onClick={() => pushFilters({ tag: tag.slug })}
              className={`cursor-pointer whitespace-nowrap rounded-brand-button px-4 py-2 text-sm font-medium transition-colors ${
                activeTag === tag.slug
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tag.name}
            </button>
          ))}
        </div>
      ) : null}

      {/* Server already applied brand/tag query params — do not re-slice. */}
      <ProjectGrid projects={initialProjects} />
    </div>
  );
}
