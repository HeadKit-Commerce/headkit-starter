import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";
import type { PostSummaryFieldsFragment } from "@headkit/sdk";

interface PostCardProps {
  post: PostSummaryFieldsFragment;
  textStyle?: "dark" | "light";
}

export function PostCard({ post, textStyle = "dark" }: PostCardProps) {
  const href = post.uri ?? `/news/${post.slug}/`;

  return (
    <Link href={href}>
      <div className="w-full">
        {post.featuredImage?.src ? (
          <div className="relative aspect-video w-full overflow-hidden rounded-md">
            <Image
              alt={post.featuredImage.alt ?? post.title}
              src={post.featuredImage.src}
              fill
              className="object-cover"
            />
          </div>
        ) : (
          <div className="aspect-video w-full bg-gray-100 rounded-md" />
        )}
        <div className="flex justify-between pt-2">
          <h5
            className={cn("text-xl font-semibold", {
              "text-pink-500": textStyle === "light",
              "text-purple-800": textStyle === "dark",
            })}
          >
            {post.title}
          </h5>
        </div>
        {post.categories && post.categories.length > 0 && (
          <p className="text-sm text-muted-foreground mt-1">
            {post.categories.map((c) => c.name).join(", ")}
          </p>
        )}
      </div>
    </Link>
  );
}
