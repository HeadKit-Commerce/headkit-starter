import Link from "next/link";
import Image from "next/image";
import { cn, decodeHtmlEntities } from "@/lib/utils";
import type { PostSummaryFieldsFragment } from "@headkit/sdk";

interface PostCardProps {
  post: PostSummaryFieldsFragment;
  textStyle?: "dark" | "light";
}

export function PostCard({ post, textStyle = "dark" }: PostCardProps) {
  const href = post.uri ?? `/news/${post.slug}/`;

  // Hide WordPress's default "Uncategorized" bucket — it is noise, not a
  // real editorial category (F10).
  const categories = (post.categories ?? []).filter(
    (c) => c.slug !== "uncategorized",
  );
  const title = decodeHtmlEntities(post.title ?? "");

  return (
    <Link href={href}>
      <div className="w-full">
        {post.featuredImage?.src ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-brand">
            <Image
              alt={post.featuredImage.alt ?? title}
              src={post.featuredImage.src}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="aspect-video w-full bg-gray-100 rounded-brand" />
        )}
        <div className="flex justify-between pt-3">
          <h3
            className={cn("text-[17px] font-semibold text-primary", {
              "text-pink-500": textStyle === "light",
            })}
          >
            {title}
          </h3>
        </div>
        {categories.length > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            {categories.map((c) => decodeHtmlEntities(c.name ?? "")).join(", ")}
          </p>
        )}
      </div>
    </Link>
  );
}
