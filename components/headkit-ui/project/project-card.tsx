import Link from "next/link";
import Image from "next/image";
import { decodeHtmlEntities } from "@/lib/utils";
import type { ProjectSummaryFieldsFragment } from "@headkit/sdk";

interface ProjectCardProps {
  project: ProjectSummaryFieldsFragment;
}

/**
 * Project tile for carousel/grid. Square image (category-tile ratio) with
 * title, first tag, and location below — not brand.
 */
export function ProjectCard({ project }: ProjectCardProps): React.ReactElement {
  const href = project.uri ?? `/projects/${project.slug}/`;
  const title = decodeHtmlEntities(project.title ?? "");
  const tagName = project.tags?.[0]?.name
    ? decodeHtmlEntities(project.tags[0].name)
    : null;
  const location = project.location
    ? decodeHtmlEntities(project.location)
    : null;
  const meta = [tagName, location].filter(Boolean);

  return (
    <Link href={href}>
      <div className="w-full">
        {project.featuredImage?.src ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-brand">
            <Image
              alt={project.featuredImage.alt ?? title}
              src={project.featuredImage.src}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="aspect-square w-full rounded-brand bg-gray-100" />
        )}
        <h3 className="pt-3 text-[17px] font-semibold text-primary">{title}</h3>
        {meta.length > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.join(" · ")}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
