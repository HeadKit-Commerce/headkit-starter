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
 * Cached PRIMARY/SECONDARY menu read, tagged BY LOCATION
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
 * Fetch the CMS FOOTER menu (FE-01) via the same SDK menu transport as the
 * PRIMARY/SECONDARY navigation. The `FOOTER` MenuLocation was added to the SDK
 * enum in plan 03-02; when no WP footer menu is registered this resolves to an
 * empty list and the `Footer` falls back to its branding/static layout.
 *
 * Exported (rather than consumed inside `NavigationWrapper`) because the
 * `Footer` is rendered by the root layout, not the nav bar — but it shares the
 * exact same `fetchMenu("FOOTER")` SDK path established here.
 *
 * Cached (Cache Components, `'use cache'`): the FOOTER menu is a per-deploy CMS
 * read via the PK-only SDK singleton — no per-request runtime API (cookies/
 * headers/searchParams), so it is deterministic and cacheable. Because the
 * `Footer` is NOT Suspense-wrapped in the root layout, an UNCACHED read here
 * poisoned every route's static prerender under Cache Components; caching it
 * moves the layout's footer read into the cached static shell.
 *
 * This IS the footer data-producing entry, so it carries its invalidation tags
 * DIRECTLY (09.5-03, CACHE-03): nested tags don't bubble, so routing through the
 * by-location `fetchMenu('FOOTER')` would leave a footer edit unable to
 * invalidate this read. Loading via the plain `loadMenu` helper keeps the tags
 * on this entry. It subscribes BOTH `TAG.footer` (`headkit:footer`) and
 * `TAG.menu('FOOTER')` (`headkit:menu:FOOTER`) because WP's menu handler fires
 * the uniform `menu:{location}` tag for every location — without menu:FOOTER a
 * footer-menu edit (which emits only menu:FOOTER) never purged this entry.
 * Finite `days` backstop (D4).
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
  // Subscribe to exactly what this wrapper composes: the primary + secondary
  // menus AND branding (the wrapper renders the logo from getBrandingAssets/
  // getBranding, and nested tags don't bubble — without TAG.branding here a logo
  // change never purges the nav). NEVER a route/page tag on chrome (D2 /
  // T-09.5-09).
  cacheTag(TAG.menu("PRIMARY"), TAG.menu("SECONDARY"), TAG.branding);

  // Per-store branding logo (ENG-572): dashboard-api logoUrl, falling back to
  // the commerce branding icon (available locally), else the default <Logo/>.
  // storeSettings.name drives the logo alt text.
  const [primaryItems, secondaryItems, { logoUrl }, { storeSettings }] =
    await Promise.all([
      fetchMenu("PRIMARY"),
      fetchMenu("SECONDARY"),
      getBrandingAssets(),
      getBranding(),
    ]);

  return (
    <NavigationBar
      primaryMenuItems={primaryItems}
      secondaryMenuItems={secondaryItems}
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
