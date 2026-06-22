import type { MenuLocation } from "@headkit/sdk";
import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
} from "next/cache";
import { headkit } from "@/lib/sdk";
import { createServerHeadkit } from "@/lib/sdk.server";
import { getCartToken } from "@/lib/cart";
import {
  NavigationBar,
  type NavMenuItem,
} from "@/components/headkit-ui/navigation-bar";
import { MobileHeaderActions } from "@/components/headkit-ui/header-actions";
import { Logo } from "@/components/icon/logo";

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
    uri: item.uri,
    description: item.description ?? null,
    children: Array.isArray(item.children)
      ? normalizeMenuItems(item.children)
      : [],
  }));
}

async function fetchMenu(location: MenuLocation): Promise<NavMenuItem[]> {
  try {
    const tree = await headkit.menu.get(location);
    return normalizeMenuItems(tree);
  } catch {
    return [];
  }
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
 * moves the layout's footer read into the cached static shell. The stable
 * `'footer-menu'` cacheTag lets a future `/api/revalidate` invalidate it when
 * the WP footer menu changes.
 */
export async function getFooterMenu(): Promise<NavMenuItem[]> {
  "use cache";
  cacheLife("hours");
  cacheTag("footer-menu");
  return fetchMenu("FOOTER");
}

async function fetchCartCount(): Promise<number> {
  try {
    const cartToken = await getCartToken();
    if (!cartToken) return 0;
    const cart = await createServerHeadkit(cartToken).cart.get();
    return cart?.itemsCount ?? 0;
  } catch {
    return 0;
  }
}

export async function NavigationWrapper() {
  const [primaryItems, secondaryItems, cartCount] = await Promise.all([
    fetchMenu("PRIMARY"),
    fetchMenu("SECONDARY"),
    fetchCartCount(),
  ]);

  return (
    <NavigationBar
      primaryMenuItems={primaryItems}
      secondaryMenuItems={secondaryItems}
      logo={<Logo />}
      initialCartCount={cartCount}
      mobileActions={<MobileHeaderActions />}
    />
  );
}
