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
import { resolveStoreName } from "@/lib/make-metadata";

/** Permissive shape for API menu nodes (GraphQL fragment stops at 3 levels, so innermost lacks children). */
type MenuItemLike = {
  id: string;
  label: string;
  uri: string;
  description?: string | null;
  cssClasses?: string[] | null;
  children?: MenuItemLike[];
};

type NavigationMenuLike = {
  name: string;
  description?: string | null;
  items: MenuItemLike[];
};

/** CSS class on a Custom Link whose label is the left-side preheader message. */
const PREHEADER_TITLE_CLASS = "preheader-title";

/** WP menu names that are location labels, not customer-facing copy. */
const GENERIC_PREHEADER_NAMES = new Set([
  "pre header",
  "pre-header",
  "preheader",
  "pre_header",
]);

function hasCssClass(item: MenuItemLike, className: string): boolean {
  return (item.cssClasses ?? []).includes(className);
}

/**
 * Resolve left-side preheader copy from WordPress in priority order:
 * 1. Custom Link with CSS class `preheader-title` (preferred — editable as a menu item)
 * 2. Menu term description (rarely set in Appearance → Menus)
 * 3. Menu name, unless it looks like a generic location label ("Pre Header")
 */
function resolvePreheaderTitle(menu: NavigationMenuLike): string | undefined {
  const titled = menu.items.find((item) =>
    hasCssClass(item, PREHEADER_TITLE_CLASS),
  );
  const fromItem = titled?.label?.trim();
  if (fromItem) {
    return fromItem;
  }
  const fromDescription = menu.description?.trim();
  if (fromDescription) {
    return fromDescription;
  }
  const fromName = menu.name?.trim();
  if (fromName && !GENERIC_PREHEADER_NAMES.has(fromName.toLowerCase())) {
    return fromName;
  }
  return undefined;
}

function resolvePreheaderLinks(
  items: NavMenuItem[],
): { label: string; uri: string }[] {
  return items
    .filter((item) => !(item.cssClasses ?? []).includes(PREHEADER_TITLE_CLASS))
    .map((item) => ({ label: item.label, uri: item.uri }));
}

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
    cssClasses: item.cssClasses ?? [],
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

const HEADER_LOCATIONS = [
  "PRIMARY",
  "SECONDARY",
  "PRE_HEADER",
] as const satisfies readonly MenuLocation[];

const FOOTER_LOCATIONS = [
  "FOOTER",
  "FOOTER_2",
  "FOOTER_POLICY",
] as const satisfies readonly MenuLocation[];

const EMPTY_MENU: NavigationMenuLike = {
  name: "",
  description: null,
  items: [],
};

/**
 * One GraphQL round-trip for the given locations (commerce fetches WP in
 * parallel). Degrades to empty menus on failure. Result order matches
 * `locations`.
 */
async function loadMenusBatch(
  locations: readonly MenuLocation[],
): Promise<NavigationMenuLike[]> {
  try {
    const menus = await headkit.menu.getMenus([...locations]);
    return locations.map((_, i) => {
      const menu = menus[i];
      if (!menu) {
        return { ...EMPTY_MENU };
      }
      return {
        name: menu.name,
        description: menu.description ?? null,
        items: menu.items,
      };
    });
  } catch {
    return locations.map(() => ({ ...EMPTY_MENU }));
  }
}

/**
 * Cached PRIMARY/SECONDARY/PRE_HEADER menu read, tagged BY LOCATION
 * (`TAG.menu(location)` → `headkit:menu:{location}`) so a menu edit for one
 * location invalidates only that location's entry — not one blanket tag across
 * every menu (09.5-03, CACHE-03). Finite `days` backstop (D4): a missed webhook
 * self-heals in ~1 day instead of `max` (~30d).
 *
 * Prefer {@link NavigationWrapper}'s batched `getMenus` for chrome that needs
 * several locations; keep this for single-location callers.
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
 *   [0] FOOTER       → column title = menu name; links = items
 *   [1] FOOTER_2     → column title = menu name; links = items
 *   [2] FOOTER_POLICY → copyright line = menu name; links = policy items
 *
 * Fetched via a single `menus(locations:)` GraphQL query (one storefront RTT;
 * commerce hits WP locations in parallel). Always returns three sections so
 * Footer's `menus[2]` policy/copyright slot stays stable when unassigned.
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

  const menus = await loadMenusBatch(FOOTER_LOCATIONS);
  const footer = menus[0] ?? EMPTY_MENU;
  const footer2 = menus[1] ?? EMPTY_MENU;
  const policy = menus[2] ?? EMPTY_MENU;

  const toSection = (
    location: (typeof FOOTER_LOCATIONS)[number],
    menu: NavigationMenuLike,
  ): {
    location: string;
    name: string;
    items: { id: string; label: string; uri: string }[];
  } => ({
    location,
    name: menu.name.trim(),
    items: normalizeMenuItems(menu.items).map((item) => ({
      id: item.id,
      label: item.label,
      uri: item.uri,
    })),
  });

  return [
    toSection("FOOTER", footer),
    toSection("FOOTER_2", footer2),
    toSection("FOOTER_POLICY", policy),
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

  // One menus(locations:) GraphQL RTT for PRIMARY + SECONDARY + PRE_HEADER
  // (commerce fetches WP in parallel). Branding stays parallel with that batch.
  const [headerMenus, { logoUrl }, { storeSettings }] = await Promise.all([
    loadMenusBatch(HEADER_LOCATIONS),
    getBrandingAssets(),
    getBranding(),
  ]);

  const primaryItems = normalizeMenuItems((headerMenus[0] ?? EMPTY_MENU).items);
  const secondaryItems = normalizeMenuItems(
    (headerMenus[1] ?? EMPTY_MENU).items,
  );
  const preheaderMenu = headerMenus[2] ?? EMPTY_MENU;
  const preheaderItems = normalizeMenuItems(preheaderMenu.items);
  const preheaderTitle = resolvePreheaderTitle(preheaderMenu);
  const preheaderLinks = resolvePreheaderLinks(preheaderItems);

  const showPreheader =
    (preheaderTitle !== undefined && preheaderTitle.length > 0) ||
    preheaderLinks.length > 0;

  return (
    <NavigationBar
      primaryMenuItems={primaryItems}
      secondaryMenuItems={secondaryItems}
      {...(showPreheader
        ? {
            preheader: {
              ...(preheaderTitle !== undefined
                ? { title: preheaderTitle }
                : {}),
              links: preheaderLinks,
            },
          }
        : {})}
      logo={
        <BrandLogo
          logoUrl={logoUrl}
          siteName={resolveStoreName(storeSettings.name)}
        />
      }
      mobileActions={<MobileHeaderActions />}
    />
  );
}
