import Image from "next/image";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import { CATALOG_GRID_IMAGE_SIZES } from "@/components/headkit-ui/catalog-grid";
import { cn, decodeHtmlEntities } from "@/lib/utils";
import type { PostSummaryFieldsFragment } from "@headkit/sdk";

interface PostCardProps {
  post: PostSummaryFieldsFragment;
  textStyle?: "dark" | "light";
  /** Mark early-grid images as LCP candidates. */
  priority?: boolean;
  className?: string;
}

export function PostCard({
  post,
  textStyle = "dark",
  priority = false,
  className,
}: PostCardProps) {
  const href = post.uri ?? `/news/${post.slug}/`;

  // Hide WordPress's default "Uncategorized" bucket — it is noise, not a
  // real editorial category (F10).
  const categories = (post.categories ?? []).filter(
    (c) => c.slug !== "uncategorized",
  );
  const title = decodeHtmlEntities(post.title ?? "");

  return (
    <InstantLink href={href} className={cn("block", className)}>
      <div className="w-full">
        {post.featuredImage?.src ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-brand">
            <Image
              alt={post.featuredImage.alt ?? title}
              src={post.featuredImage.src}
              fill
              priority={priority}
              fetchPriority={priority ? "high" : "auto"}
              className="object-cover"
              sizes={CATALOG_GRID_IMAGE_SIZES}
            />
          </div>
        ) : (
          <div className="aspect-video w-full rounded-brand bg-gray-100" />
        )}
        <div className="flex justify-between pt-3">
          <h3
            className={cn("text-[17px] text-primary", {
              "text-pink-500": textStyle === "light",
            })}
          >
            {title}
          </h3>
        </div>
        {categories.length > 0 && (
          <p className="mt-1 text-sm text-muted-foreground">
            {categories.map((c) => decodeHtmlEntities(c.name ?? "")).join(", ")}
          </p>
        )}
      </div>
    </InstantLink>
  );
}
