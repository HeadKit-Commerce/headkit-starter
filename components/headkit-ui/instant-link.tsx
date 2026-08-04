"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

type PendingVariant = "card" | "text";

/**
 * Pending cue for Instant Navigation — must render as a child of `<Link>`.
 * Card: translucent pulse over media/cards. Text: subtle pulse behind label.
 */
function LinkPendingOverlay({
  variant,
}: {
  variant: PendingVariant;
}): React.JSX.Element | null {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  if (variant === "text") {
    return (
      <span
        aria-hidden
        className="absolute inset-0 z-[1] animate-pulse rounded-sm bg-primary/10"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute inset-0 z-[1] animate-pulse bg-brand-bg/40"
    />
  );
}

type InstantLinkProps = ComponentProps<typeof Link> & {
  pendingVariant?: PendingVariant;
};

/**
 * Next.js 16.3 Instant Navigation link.
 *
 * With `partialPrefetching`, default `<Link>` only pulls the shared App Shell.
 * `prefetch={true}` opts into per-URL runtime prefetch so `'use cache'` content
 * keyed on `params`/`searchParams` can resolve before click.
 */
export function InstantLink({
  prefetch = true,
  pendingVariant = "card",
  className,
  children,
  ...rest
}: InstantLinkProps): React.JSX.Element {
  return (
    <Link {...rest} prefetch={prefetch} className={cn("relative", className)}>
      <LinkPendingOverlay variant={pendingVariant} />
      {children}
    </Link>
  );
}
