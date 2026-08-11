"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { isAppNavigationHref } from "@/lib/convert-uri";
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
  // pointer-events-none: pending overlays must not steal hit-testing or Safari
  // will flip the cursor back to the default arrow over the link.
  if (variant === "text") {
    return (
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-[1] animate-pulse rounded-sm bg-primary/10"
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

function hrefToString(href: ComponentProps<typeof Link>["href"]): string {
  if (typeof href === "string") return href;
  if (href != null && typeof href === "object" && "pathname" in href) {
    return href.pathname ?? "";
  }
  return "";
}

/**
 * Next.js 16.3 Instant Navigation link.
 *
 * With `partialPrefetching`, default `<Link>` only pulls the shared App Shell.
 * `prefetch={true}` opts into per-URL runtime prefetch so `'use cache'` content
 * keyed on `params`/`searchParams` can resolve before click.
 *
 * Non-app hrefs (`tel:`, `mailto:`, absolute http(s), …) render a plain `<a>`
 * so special-scheme Custom Links from WordPress menus keep working.
 */
export function InstantLink({
  prefetch = true,
  pendingVariant = "card",
  className,
  children,
  href,
  ...rest
}: InstantLinkProps): React.JSX.Element {
  const hrefStr = hrefToString(href);

  if (hrefStr && !isAppNavigationHref(hrefStr)) {
    return (
      <a href={hrefStr} className={cn("relative cursor-pointer", className)}>
        {children as ReactNode}
      </a>
    );
  }

  return (
    <Link
      {...rest}
      href={href}
      prefetch={prefetch}
      className={cn("relative cursor-pointer", className)}
    >
      <LinkPendingOverlay variant={pendingVariant} />
      {children}
    </Link>
  );
}
