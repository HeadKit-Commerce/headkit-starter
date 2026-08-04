"use client";

import { Carousel } from "@/components/headkit-ui/carousel";
import { ProjectCard } from "./project-card";
import type { ProjectSummaryFieldsFragment } from "@headkit/sdk";

interface ProjectCarouselProps {
  projects: ProjectSummaryFieldsFragment[];
}

export function ProjectCarousel({
  projects,
}: ProjectCarouselProps): React.ReactElement {
  return (
    <Carousel
      items={projects}
      renderItem={(project) => <ProjectCard project={project} />}
      className="w-full pb-8"
      showPagination={false}
    />
  );
}
