"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import { ChevronDownIcon, MenuIcon, XIcon } from "@/components/icon";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn, decodeHtmlEntities } from "@/lib/utils";
import { HeaderActions } from "@/components/headkit-ui/header-actions";
import { CartTriggerButton } from "@/components/headkit-ui/cart-drawer";

/** A navigation tree node returned by headkit.menu.get(). */
export interface NavMenuItem {
  id: string;
  label: string;
  uri: string;
  description?: string | null;
  /** Provider CSS classes (e.g. "highlighted", "hidden", "preheader-title"). */
  cssClasses?: string[];
  children: NavMenuItem[];
}

interface NavigationBarProps {
  primaryMenuItems: NavMenuItem[];
  secondaryMenuItems?: NavMenuItem[];
  logo: React.ReactNode;
  /** Right-side icons for desktop (Search, Wishlist, Account, Cart). */
  actions?: React.ReactNode;
  /** Pre-fetched cart count for HeaderActions when actions is not provided. */
  initialCartCount?: number;
  /** Icons shown in the mobile sheet nav footer. */
  mobileActions?: React.ReactNode;
  preheader?: {
    title?: string;
    message?: string;
    links?: { label: string; uri: string }[];
  } | null;
  /** Links whose href should receive sale/highlighted styling. */
  highlightedLinks?: string[];
}

function removeTrailingSlash(url: string): string {
  return url.length > 1 ? url.replace(/\/$/, "") : url;
}

function isHighlightedItem(
  item: NavMenuItem,
  highlightedLinks: string[],
): boolean {
  return highlightedLinks.some(
    (h) => removeTrailingSlash(h) === removeTrailingSlash(item.uri),
  );
}

export function NavigationBar({
  primaryMenuItems,
  secondaryMenuItems,
  logo,
  actions,
  initialCartCount,
  mobileActions,
  preheader,
  highlightedLinks = [],
}: NavigationBarProps) {
  const desktopActions = actions ?? (
    <HeaderActions initialCartCount={initialCartCount ?? 0} />
  );
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const navRef = useRef<React.ElementRef<typeof NavigationMenu>>(null);
  const [mobileMenuTop, setMobileMenuTop] = useState(80);

  // Keep the mobile drawer/overlay flush under the sticky logo bar (and any
  // visible preheader) so the panel never covers the brand mark or hamburger.
  useEffect(() => {
    const updateMenuTop = () => {
      const bottom = navRef.current?.getBoundingClientRect().bottom;
      if (typeof bottom === "number" && bottom > 0) {
        setMobileMenuTop(Math.round(bottom));
      }
    };
    updateMenuTop();
    window.addEventListener("scroll", updateMenuTop, { passive: true });
    window.addEventListener("resize", updateMenuTop);
    return () => {
      window.removeEventListener("scroll", updateMenuTop);
      window.removeEventListener("resize", updateMenuTop);
    };
  }, [mobileOpen, preheader]);

  return (
    <>
      {preheader && (
        <Preheader
          {...(preheader.title !== undefined ? { title: preheader.title } : {})}
          {...(preheader.message !== undefined
            ? { message: preheader.message }
            : {})}
          {...(preheader.links !== undefined ? { links: preheader.links } : {})}
        />
      )}

      {/* Backdrop overlay when desktop mega menu is open */}
      <div
        className={cn(
          "fixed inset-0 z-[15] top-[130px] bg-black/50 backdrop-blur-xs transition-opacity duration-300",
          menuOpen ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      />

      <NavigationMenu
        ref={navRef}
        onValueChange={(val) => setMenuOpen(!!val)}
        className={cn(
          "sticky top-0 flex items-center justify-between h-20 w-full max-w-full px-5 md:px-10 font-body text-primary backdrop-blur-xs transition-colors",
          // Stay above the mobile sheet/overlay so logo + hamburger remain usable.
          mobileOpen ? "z-[60]" : "z-20",
          // Solid only while mega-menu / mobile sheet is open, or on hover.
          // Scrolled alone keeps translucency so content shows through.
          menuOpen || mobileOpen
            ? "bg-brand-bg"
            : "bg-brand-bg/75 hover:bg-brand-bg",
        )}
      >
        {/* Left: logo + primary menu */}
        <NavigationMenuList className="space-x-0">
          <NavigationMenuItem className="mr-4 hover:opacity-75">
            <NavigationMenuLink asChild>
              <Link href="/" aria-label="Home" className="cursor-pointer">
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                {logo as any}
              </Link>
            </NavigationMenuLink>
          </NavigationMenuItem>

          {/* No wrapper element: <ul> children must be <li> (a11y list/listitem).
              Desktop-only visibility lives on each NavigationMenuItem. */}
          {primaryMenuItems.length > 0 && (
            <DesktopMenuSection
              items={primaryMenuItems}
              highlightedLinks={highlightedLinks}
            />
          )}
        </NavigationMenuList>

        {/* Right: secondary menu + actions + mobile toggle */}
        <NavigationMenuList className="space-x-0">
          {secondaryMenuItems && secondaryMenuItems.length > 0 && (
            <DesktopMenuSection
              items={secondaryMenuItems}
              highlightedLinks={highlightedLinks}
            />
          )}

          {desktopActions && (
            <NavigationMenuItem className="hidden md:flex items-center">
              {desktopActions}
            </NavigationMenuItem>
          )}

          {/* Mobile sticky cart — outside the sheet so shoppers can open bag without opening the menu */}
          <NavigationMenuItem className="md:hidden">
            <CartTriggerButton initialCartCount={initialCartCount ?? 0} />
          </NavigationMenuItem>

          {/* Mobile hamburger */}
          <NavigationMenuItem className="md:hidden">
            <Sheet
              open={mobileOpen}
              onOpenChange={(open) => {
                if (open && navRef.current) {
                  setMobileMenuTop(
                    Math.round(navRef.current.getBoundingClientRect().bottom),
                  );
                }
                setMobileOpen(open);
              }}
              modal={false}
            >
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={mobileOpen ? "Close menu" : "Open menu"}
                  className="pr-0"
                >
                  {mobileOpen ? (
                    <XIcon className="h-6 w-6 text-primary transition-opacity hover:opacity-70" />
                  ) : (
                    <MenuIcon className="h-6 w-6 text-primary transition-opacity hover:opacity-70" />
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent
                side="left"
                style={{ top: mobileMenuTop }}
                overlayStyle={{ top: mobileMenuTop }}
                overlayClassName="bg-black/40"
                // Panel starts under the measured nav bottom so the logo bar
                // stays visible; brand background fills the drawer.
                className="inset-y-auto bottom-0 h-auto max-h-none px-0 py-0 w-full max-w-full sm:max-w-full rounded-none border-none bg-brand-bg [&>button]:hidden"
              >
                <SheetTitle hidden />
                <SheetDescription hidden />
                <nav className="flex flex-col gap-4 overflow-y-auto max-h-full pb-20 px-7 pt-6">
                  {primaryMenuItems.length > 0 && (
                    <MobileMenuSection
                      items={primaryMenuItems}
                      onSelect={() => setMobileOpen(false)}
                      highlightedLinks={highlightedLinks}
                    />
                  )}
                  {secondaryMenuItems && secondaryMenuItems.length > 0 && (
                    <MobileMenuSection
                      items={secondaryMenuItems}
                      onSelect={() => setMobileOpen(false)}
                      highlightedLinks={highlightedLinks}
                    />
                  )}
                  {mobileActions && (
                    <div className="flex gap-4 pt-4 border-t border-neutral-100">
                      {mobileActions}
                    </div>
                  )}
                </nav>
              </SheetContent>
            </Sheet>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    </>
  );
}

// ---------------------------------------------------------------------------
// Preheader
// ---------------------------------------------------------------------------

function Preheader({
  title,
  message,
  links,
}: {
  title?: string;
  message?: string;
  links?: { label: string; uri: string }[];
}) {
  return (
    <div className="flex h-[30px] items-center justify-end sm:justify-between bg-primary px-5 text-sm text-brand-bg md:px-10">
      {title && <div className="hidden sm:block text-brand-bg">{title}</div>}
      {(message ?? (links && links.length > 0)) && (
        <div className="flex items-center gap-4 md:gap-8 text-brand-bg">
          {message && <span className="text-brand-bg">{message}</span>}
          {links?.map(({ label, uri }, i) => (
            <Link key={i} href={uri} className="underline text-brand-bg">
              {decodeHtmlEntities(label)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Desktop – DesktopMenuSection
// ---------------------------------------------------------------------------

function DesktopMenuSection({
  items,
  highlightedLinks,
}: {
  items: NavMenuItem[];
  highlightedLinks: string[];
}) {
  const router = useRouter();
  return (
    <>
      {items.map((item) => (
        <NavigationMenuItem key={item.id} className="hidden md:flex">
          {item.children.length > 0 ? (
            <>
              <NavigationMenuTrigger
                asChild
                className={cn(
                  "font-body text-primary hover:text-primary",
                  isHighlightedItem(item, highlightedLinks) &&
                    "text-pink-500 hover:!text-pink-600",
                )}
              >
                {/*
                  Radix Trigger's onClick preventDefault()s before Next Link's
                  navigation, so a plain <Link> only toggles the dropdown.
                  Drive navigation explicitly so click → parent uri while the
                  href stays for SEO/a11y and hover still opens the MegaMenu.
                */}
                <InstantLink
                  href={removeTrailingSlash(item.uri)}
                  pendingVariant="text"
                  onClick={(e) => {
                    // Radix Trigger preventDefault()s before Next Link navigates;
                    // drive navigation explicitly while keeping prefetch={true}
                    // for Instant Navigation / Partial Prefetching.
                    e.preventDefault();
                    router.push(removeTrailingSlash(item.uri));
                  }}
                >
                  {decodeHtmlEntities(item.label)}
                </InstantLink>
              </NavigationMenuTrigger>
              <NavigationMenuContent className="w-screen! rounded-none! bg-brand-bg">
                <MegaMenu items={item.children} />
              </NavigationMenuContent>
            </>
          ) : (
            <NavigationMenuLink asChild>
              <InstantLink
                href={removeTrailingSlash(item.uri)}
                pendingVariant="text"
                className={cn(
                  navigationMenuTriggerStyle(),
                  "font-body text-primary hover:text-primary",
                  isHighlightedItem(item, highlightedLinks) &&
                    "text-pink-500 hover:!text-pink-600",
                )}
              >
                {decodeHtmlEntities(item.label)}
              </InstantLink>
            </NavigationMenuLink>
          )}
        </NavigationMenuItem>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Desktop – MegaMenu
// ---------------------------------------------------------------------------

function MegaMenu({ items }: { items: NavMenuItem[] }) {
  return (
    <ul className="grid gap-5 w-full px-5 md:px-10 py-6 grid-cols-2 md:grid-cols-4 lg:grid-cols-6">
      {items.map((item) => (
        <li key={item.id}>
          <NavigationMenuLink asChild>
            <InstantLink
              href={removeTrailingSlash(item.uri)}
              pendingVariant="text"
              className="font-semibold text-primary hover:opacity-80 uppercase block mb-2"
            >
              {decodeHtmlEntities(item.label)}
            </InstantLink>
          </NavigationMenuLink>
          {item.children.length > 0 && (
            <ul className="flex flex-col gap-1">
              {item.children.map((child) => (
                <li key={child.id}>
                  <NavigationMenuLink asChild>
                    <InstantLink
                      href={removeTrailingSlash(child.uri)}
                      pendingVariant="text"
                      className="text-primary/70 hover:opacity-80 text-sm block py-0.5"
                    >
                      {child.label}
                    </InstantLink>
                  </NavigationMenuLink>
                </li>
              ))}
            </ul>
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Mobile – MobileMenuSection
// ---------------------------------------------------------------------------

function MobileMenuSection({
  items,
  onSelect,
  highlightedLinks,
}: {
  items: NavMenuItem[];
  onSelect?: (() => void) | undefined;
  highlightedLinks: string[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => (
        <MobileMenuItem
          key={item.id}
          item={item}
          onSelect={onSelect}
          highlightedLinks={highlightedLinks}
        />
      ))}
    </div>
  );
}

function MobileMenuItem({
  item,
  onSelect,
  highlightedLinks,
}: {
  item: NavMenuItem;
  onSelect?: (() => void) | undefined;
  highlightedLinks: string[];
}) {
  if (item.children.length > 0) {
    return (
      <Collapsible>
        <CollapsibleTrigger className="text-xl font-semibold font-body text-primary flex w-full justify-between items-center group focus-visible:outline-none">
          <span className="group-data-[state=open]:opacity-70">
            {decodeHtmlEntities(item.label)}
          </span>
          <span className="group-data-[state=open]:hidden text-primary">
            <ChevronDownIcon size={20} />
          </span>
          <span className="hidden group-data-[state=open]:block rotate-180 text-primary">
            <ChevronDownIcon size={20} />
          </span>
        </CollapsibleTrigger>
        <CollapsibleContent className="flex flex-col gap-2 pt-2">
          {item.children.map((child) => (
            <div key={child.id}>
              {child.children.length > 0 ? (
                <>
                  <InstantLink
                    href={removeTrailingSlash(child.uri)}
                    pendingVariant="text"
                    className="font-medium text-primary hover:opacity-70 block py-1"
                    {...(onSelect ? { onClick: onSelect } : {})}
                  >
                    {child.label}
                  </InstantLink>
                  <div className="flex flex-col gap-1 pl-3">
                    {child.children.map((sub) => (
                      <InstantLink
                        key={sub.id}
                        href={removeTrailingSlash(sub.uri)}
                        pendingVariant="text"
                        className="text-primary/70 hover:opacity-70 text-[15px] block py-0.5"
                        {...(onSelect ? { onClick: onSelect } : {})}
                      >
                        {sub.label}
                      </InstantLink>
                    ))}
                  </div>
                </>
              ) : (
                <InstantLink
                  href={removeTrailingSlash(child.uri)}
                  pendingVariant="text"
                  className="text-primary/70 hover:opacity-70 text-lg block py-1"
                  {...(onSelect ? { onClick: onSelect } : {})}
                >
                  {child.label}
                </InstantLink>
              )}
            </div>
          ))}
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <InstantLink
      href={removeTrailingSlash(item.uri)}
      pendingVariant="text"
      className={cn(
        "text-xl font-semibold font-body text-primary hover:opacity-70",
        isHighlightedItem(item, highlightedLinks) &&
          "text-pink-500 hover:!text-pink-600",
      )}
      {...(onSelect ? { onClick: onSelect } : {})}
    >
      {decodeHtmlEntities(item.label)}
    </InstantLink>
  );
}
