import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type SkeletonProps = HTMLAttributes<HTMLDivElement> & {
  /**
   * When false, skip `animate-pulse` for App Shell / CDN-sealed fallbacks
   * (Partial Prefetching). Pulse class names inflate RSC HTML for every
   * collection/shop navigation; static placeholders keep layout reserved.
   */
  animated?: boolean;
};

function Skeleton({ className, animated = true, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-brand bg-primary/10 dark:bg-primary/20",
        animated && "animate-pulse",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
