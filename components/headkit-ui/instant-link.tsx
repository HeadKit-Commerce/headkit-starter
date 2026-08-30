"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { convertToRelativePath, isAppNavigationHref } from "@/lib/convert-uri";
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

function normalizeLinkHref(
  href: ComponentProps<typeof Link>["href"],
): ComponentProps<typeof Link>["href"] {
  if (typeof href === "string") {
    const normalized = convertToRelativePath(href);
    return normalized || href;
  }
  if (
    href != null &&
    typeof href === "object" &&
    "pathname" in href &&
    typeof href.pathname === "string"
  ) {
    const normalized = convertToRelativePath(href.pathname);
    if (normalized && normalized !== href.pathname) {
      return { ...href, pathname: normalized };
    }
  }
  return href;
}

/**
 * Next.js 16.3 Instant Navigation link.
 *
 * With `partialPrefetching`, default `<Link>` only pulls the shared App Shell.
 * `prefetch={true}` opts into per-URL runtime prefetch so `'use cache'` content
 * keyed on `params`/`searchParams` can resolve before click.
 *
 * Absolute http(s) storefront URLs from WooCommerce/Shopify CMS fields are
 * normalized to relative paths (same as nav menus) so carousel CTAs and block
 * buttons get Next.js prefetch instead of a full document load.
 *
 * Non-app hrefs (`tel:`, `mailto:`, `#`, off-origin http(s), …) render a plain
 * `<a>` so special-scheme Custom Links from WordPress menus keep working.
 *
 * That plain `<a>` MUST still forward every prop it was handed. InstantLink is
 * used as a Radix `asChild` target (see NavigationBar), and Radix injects the
 * trigger wiring — `ref`, `onPointerEnter`/`onClick`, `id`, `aria-expanded`,
 * `data-state`, `data-radix-collection-item` — through the child's props.
 * Dropping them turned a WordPress mega-menu parent whose Custom Link URL is
 * `#` (the conventional "opens a dropdown, navigates nowhere" parent) into an
 * inert anchor: the trigger never mounted, so its children were unreachable and
 * the item looked like a plain top-level link. Only `next/link`-specific props
 * are stripped — they are not valid DOM attributes on `<a>`.
 */
export function InstantLink({
  prefetch = true,
  pendingVariant = "card",
  className,
  children,
  href,
  ...rest
}: InstantLinkProps): React.JSX.Element {
  const normalizedHref = normalizeLinkHref(href);
  const hrefStr = hrefToString(normalizedHref);

  if (hrefStr && !isAppNavigationHref(hrefStr)) {
    // Destructured (not deleted by key) so a future next/link rename fails the
    // typecheck here instead of silently leaking a prop onto the DOM.
    const {
      as: _as,
      replace: _replace,
      scroll: _scroll,
      shallow: _shallow,
      passHref: _passHref,
      locale: _locale,
      legacyBehavior: _legacyBehavior,
      onNavigate: _onNavigate,
      ...anchorProps
    } = rest;
    const isHttpExternal =
      hrefStr.startsWith("http://") || hrefStr.startsWith("https://");
    return (
      <a
        {...anchorProps}
        href={hrefStr}
        className={cn("relative cursor-pointer", className)}
        {...(isHttpExternal
          ? {
              target: anchorProps.target ?? "_blank",
              rel: anchorProps.rel ?? "noopener noreferrer",
            }
          : {})}
      >
        {children as ReactNode}
      </a>
    );
  }

  return (
    <Link
      {...rest}
      href={normalizedHref}
      prefetch={prefetch}
      className={cn("relative cursor-pointer", className)}
    >
      <LinkPendingOverlay variant={pendingVariant} />
      {children}
    </Link>
  );
}
