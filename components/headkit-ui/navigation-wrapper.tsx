import type { MenuLocation } from "@headkit/sdk";
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
