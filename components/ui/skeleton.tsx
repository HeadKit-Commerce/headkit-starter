import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-brand bg-primary/10 dark:bg-primary/20",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };
