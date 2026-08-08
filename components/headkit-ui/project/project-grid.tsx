import type { ProjectSummaryFieldsFragment } from "@headkit/sdk";
import { CATALOG_GRID_CLASS } from "@/components/headkit-ui/catalog-grid";
import { ProjectCard } from "./project-card";

interface ProjectGridProps {
  projects: ProjectSummaryFieldsFragment[];
}

export function ProjectGrid({
  projects,
}: ProjectGridProps): React.ReactElement {
  if (!projects.length) {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-20 text-center md:px-10">
        <p className="text-lg font-medium text-gray-900">No projects found</p>
        <p className="mt-2 text-sm text-gray-500">
          Try adjusting your filters or browse other projects.
        </p>
      </div>
    );
  }

  return (
    <div className="z-5 px-5 md:px-10">
      <div className={CATALOG_GRID_CLASS}>
        {projects.map((project, index) => (
          <ProjectCard
            key={project.id}
            project={project}
            priority={index < 2}
            {...(index >= 4
              ? {
                  className:
                    "[content-visibility:auto] [contain-intrinsic-size:auto_360px]",
                }
              : {})}
          />
        ))}
      </div>
    </div>
  );
}
