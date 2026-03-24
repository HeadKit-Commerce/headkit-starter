import type { MenuLocation } from "@headkit/sdk";
import { cacheLife, cacheTag } from "next/cache";
import { headkit } from "@/lib/sdk";
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
  "use cache";
  cacheLife("max");
  cacheTag("headkit:navigation");
  try {
    const tree = await headkit.menu.get(location);
    return normalizeMenuItems(tree);
  } catch {
    return [];
  }
}

export async function NavigationWrapper() {
  "use cache";
  cacheLife("max");
  cacheTag("headkit:navigation");

  const [primaryItems, secondaryItems] = await Promise.all([
    fetchMenu("PRIMARY"),
    fetchMenu("SECONDARY"),
  ]);

  return (
    <NavigationBar
      primaryMenuItems={primaryItems}
      secondaryMenuItems={secondaryItems}
      logo={<Logo />}
      mobileActions={<MobileHeaderActions />}
    />
  );
}
