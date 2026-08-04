"use client";

import { useState } from "react";
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
  activeBrand,
  activeTag,
}: ProjectPageProps): React.ReactElement {
  const [brandFilter, setBrandFilter] = useState(activeBrand ?? "");
  const [tagFilter, setTagFilter] = useState(activeTag ?? "");

  const brands = projectFilters?.brands ?? [];
  const tags = projectFilters?.tags ?? [];

  const filtered = initialProjects.filter((project) => {
    if (brandFilter && project.brand?.slug !== brandFilter) return false;
    if (tagFilter && !project.tags?.some((t) => t.slug === tagFilter)) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col gap-8">
      {brands.length > 0 ? (
        <div className="flex items-center gap-3 overflow-x-auto px-5 py-4 scrollbar-hide md:px-10">
          <button
            type="button"
            onClick={() => setBrandFilter("")}
            className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              brandFilter === ""
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
              onClick={() => setBrandFilter(brand.slug)}
              className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                brandFilter === brand.slug
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
            onClick={() => setTagFilter("")}
            className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              tagFilter === ""
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
              onClick={() => setTagFilter(tag.slug)}
              className={`cursor-pointer whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                tagFilter === tag.slug
                  ? "bg-primary text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {tag.name}
            </button>
          ))}
        </div>
      ) : null}

      <ProjectGrid projects={filtered} />
    </div>
  );
}
