import Link from "next/link";
import Image from "next/image";
import { decodeHtmlEntities } from "@/lib/utils";
import type { ProjectSummaryFieldsFragment } from "@headkit/sdk";

interface ProjectCardProps {
  project: ProjectSummaryFieldsFragment;
  /** Image crop. Default `square` (home / listings). Use `video` on PDP only. */
  imageAspect?: "square" | "video";
}

/**
 * Project tile for carousel/grid. Square image by default; PDP carousels pass
 * `imageAspect="video"`. Title, first tag, and location below.
 */
export function ProjectCard({
  project,
  imageAspect = "square",
}: ProjectCardProps): React.ReactElement {
  const href = project.uri ?? `/projects/${project.slug}/`;
  const title = decodeHtmlEntities(project.title ?? "");
  const tagName = project.tags?.[0]?.name
    ? decodeHtmlEntities(project.tags[0].name)
    : null;
  const location = project.location
    ? decodeHtmlEntities(project.location)
    : null;
  const meta = [tagName, location].filter(Boolean);
  const aspectClass =
    imageAspect === "video" ? "aspect-video" : "aspect-square";

  return (
    <Link href={href}>
      <div className="w-full">
        {project.featuredImage?.src ? (
          <div
            className={`relative ${aspectClass} w-full overflow-hidden rounded-brand`}
          >
            <Image
              alt={project.featuredImage.alt ?? title}
              src={project.featuredImage.src}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className={`${aspectClass} w-full rounded-brand bg-gray-100`} />
        )}
        <h3 className="pt-3 text-[17px] text-primary">{title}</h3>
        {meta.length > 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">
            {meta.join(" · ")}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
