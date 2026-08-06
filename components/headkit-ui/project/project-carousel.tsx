"use client";

import { Carousel } from "@/components/headkit-ui/carousel";
import { ProjectCard } from "./project-card";
import type { ProjectSummaryFieldsFragment } from "@headkit/sdk";

interface ProjectCarouselProps {
  projects: ProjectSummaryFieldsFragment[];
  /** Forwarded to cards. Default square; PDP passes `video`. */
  imageAspect?: "square" | "video";
}

export function ProjectCarousel({
  projects,
  imageAspect = "square",
}: ProjectCarouselProps): React.ReactElement {
  return (
    <Carousel
      items={projects}
      renderItem={(project) => (
        <ProjectCard project={project} imageAspect={imageAspect} />
      )}
      className="w-full pb-8"
      showPagination={false}
    />
  );
}
