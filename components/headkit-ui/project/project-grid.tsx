import type { ProjectSummaryFieldsFragment } from "@headkit/sdk";
import { ProjectCard } from "./project-card";

interface ProjectGridProps {
  projects: ProjectSummaryFieldsFragment[];
}

export function ProjectGrid({
  projects,
}: ProjectGridProps): React.ReactElement {
  if (!projects.length) {
    return (
      <div className="flex h-[200px] items-center justify-center">
        <p className="text-lg text-gray-500">No projects found</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 px-5 sm:grid-cols-2 md:px-10 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}
