import type { MenuLocation } from "@headkit/sdk";
import { cacheLife, cacheTag } from "next/cache";
import { convertToRelativePath } from "@/lib/convert-uri";
import { TAG } from "@/lib/cache-tags";
import { headkit } from "@/lib/sdk";
import {
  NavigationBar,
  type NavMenuItem,
} from "@/components/headkit-ui/navigation-bar";
import { MobileHeaderActions } from "@/components/headkit-ui/header-actions";
import { BrandLogo } from "@/components/icon/brand-logo";
import { getBranding, getBrandingAssets } from "@/lib/branding";

/** Permissive shape for API menu nodes (GraphQL fragment stops at 3 levels, so innermost lacks children). */
type MenuItemLike = {
  id: string;
  label: string;
  uri: string;
  description?: string | null;
  children?: MenuItemLike[];
};

/** Recursively normalize API menu nodes to NavMenuItem (ensures children is always an array). */
function normalizeMenuItems(items: MenuItemLike[]): NavMenuItem[] {
  return items.map((item) => ({
    id: item.id,
    label: item.label,
    // Defensive host-strip (belt-and-suspenders for the WP theme fix): even if a
    // menu item arrives as an absolute WP permalink, render it as a storefront-
    // relative path so <Link> never bounces the user to the WP backend.
    uri: convertToRelativePath(item.uri),
    description: item.description ?? null,
    children: Array.isArray(item.children)
      ? normalizeMenuItems(item.children)
      : [],
  }));
}

/**
 * Plain (uncached) SDK menu load + normalize. Kept separate from the cached
 * entries below so each cached fn owns its OWN `cacheTag` — the by-location menu
 * tag vs the isolated footer tag — without a nested `use cache` boundary (nested
 * tags don't bubble, so the tag must sit on the data-producing cache entry).
 */
async function loadMenu(location: MenuLocation): Promise<NavMenuItem[]> {
  try {
    const tree = await headkit.menu.get(location);
    return normalizeMenuItems(tree);
  } catch {
    return [];
  }
}

/**
 * Cached PRIMARY/SECONDARY/PRE_HEADER menu read, tagged BY LOCATION
 * (`TAG.menu(location)` → `headkit:menu:{location}`) so a menu edit for one
 * location invalidates only that location's entry — not one blanket tag across
 * every menu (09.5-03, CACHE-03). Finite `days` backstop (D4): a missed webhook
 * self-heals in ~1 day instead of `max` (~30d).
 */
export async function fetchMenu(
  location: MenuLocation,
): Promise<NavMenuItem[]> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(TAG.menu(location));
  return loadMenu(location);
}

/**
 * CMS footer menus for the root layout Footer.
 *
 * WordPress registers three locations that the Footer UI consumes in order:
 *   [0] FOOTER       → left column links (WP slug `footer`)
 *   [1] FOOTER_2     → right column links (WP slug `Footer-2`)
 *   [2] FOOTER_POLICY → bottom legal/policy links (WP slug `footer-policy`)
 *
 * Each location is a flat list of root links (not nested column parents). Always
 * returns three sections so Footer's `menus[2]` policy slot stays stable even
 * when a location is unassigned (empty items).
 *
 * Tags: `TAG.footer` plus each location's `TAG.menu(...)` so any of the three
 * WP menu edits (or the legacy footer tag) invalidate this entry.
 */
export async function getFooterMenus(): Promise<
  {
    location: string;
    name: string;
    items: { id: string; label: string; uri: string }[];
  }[]
> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(
    TAG.footer,
    TAG.menu("FOOTER"),
    TAG.menu("FOOTER_2"),
    TAG.menu("FOOTER_POLICY"),
  );

  const [footer, footer2, policy] = await Promise.all([
    loadMenu("FOOTER"),
    loadMenu("FOOTER_2"),
    loadMenu("FOOTER_POLICY"),
  ]);

  const toLinks = (
    items: NavMenuItem[],
  ): { id: string; label: string; uri: string }[] =>
    items.map((item) => ({
      id: item.id,
      label: item.label,
      uri: item.uri,
    }));

  return [
    { location: "FOOTER", name: "", items: toLinks(footer) },
    { location: "FOOTER_2", name: "", items: toLinks(footer2) },
    {
      location: "FOOTER_POLICY",
      name: "",
      items: toLinks(policy),
    },
  ];
}

/**
 * @deprecated Prefer getFooterMenus() — kept for tests that assert FOOTER tags.
 * Returns only the primary FOOTER location root items.
 */
export async function getFooterMenu(): Promise<NavMenuItem[]> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(TAG.footer, TAG.menu("FOOTER"));
  return loadMenu("FOOTER");
}

export async function NavigationWrapper() {
  "use cache: remote";
  cacheLife("days");
  // Subscribe to exactly what this wrapper composes: primary + secondary +
  // pre-header menus AND branding (the wrapper renders the logo from
  // getBrandingAssets / getBranding, and nested tags don't bubble — without
  // TAG.branding here a logo change never purges the nav). NEVER a route/page
  // tag on chrome (D2 / T-09.5-09).
  cacheTag(
    TAG.menu("PRIMARY"),
    TAG.menu("SECONDARY"),
    TAG.menu("PRE_HEADER"),
    TAG.branding,
  );

  // Per-store branding logo (ENG-572): dashboard-api logoUrl, falling back to
  // the commerce branding icon (available locally), else the default <Logo/>.
  // storeSettings.name drives the logo alt text.
  const [
    primaryItems,
    secondaryItems,
    preHeaderItems,
    { logoUrl },
    { storeSettings },
  ] = await Promise.all([
    fetchMenu("PRIMARY"),
    fetchMenu("SECONDARY"),
    fetchMenu("PRE_HEADER"),
    getBrandingAssets(),
    getBranding(),
  ]);

  return (
    <NavigationBar
      primaryMenuItems={primaryItems}
      secondaryMenuItems={secondaryItems}
      {...(preHeaderItems.length > 0
        ? {
            preheader: {
              links: preHeaderItems.map((item) => ({
                label: item.label,
                uri: item.uri,
              })),
            },
          }
        : {})}
      logo={
        <BrandLogo
          logoUrl={logoUrl}
          siteName={storeSettings.name ?? "HeadKit"}
        />
      }
      mobileActions={<MobileHeaderActions />}
    />
  );
}
