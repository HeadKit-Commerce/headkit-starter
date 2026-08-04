import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * navigation-wrapper cache-tag/life realignment guard (09.5-03, CACHE-03).
 *
 * These assertions lock the 09.5-01 contract onto the shared-chrome reads:
 *  - `fetchMenu(location)` tags BY LOCATION (`headkit:menu:{location}`), so a
 *    `revalidateTag('headkit:menu:PRIMARY')` hits only the primary menu entry —
 *    NOT one blanket tag across every menu (the old `headkit:navigation`).
 *  - the FOOTER data entry (`getFooterMenus`) carries `headkit:footer` plus each
 *    footer location tag on the fn that actually returns the footer sections
 *    (nested tags don't bubble DOWN, so the tag must sit on the data-producing
 *    entry, not a dead wrapper).
 *  - `NavigationWrapper` subscribes to exactly the menus it composes
 *    (primary + secondary + pre-header), never a single blanket tag.
 *  - every chrome read uses `cacheLife('days')` (finite D4 backstop, was `max`).
 *  - no `headkit:navigation` / `footer-menu` literal drives invalidation anymore.
 *
 * `next/cache` is mocked so `cacheTag` / `cacheLife` calls are captured; the SDK
 * + UI components are stubbed so the module imports cleanly in a node env.
 */

const cacheTag = vi.fn<(...tags: string[]) => void>();
const cacheLife = vi.fn<(profile: string) => void>();
const menuGet = vi.fn<(location: string) => Promise<unknown[]>>();
const menuGetMenu = vi.fn<
  (location: string) => Promise<{
    name: string;
    description?: string | null;
    items: unknown[];
  }>
>();
const menuGetMenus =
  vi.fn<
    (
      locations: string[],
    ) => Promise<
      Array<{ name: string; description?: string | null; items: unknown[] }>
    >
  >();

vi.mock("next/cache", () => ({
  cacheTag: (...tags: string[]): void => cacheTag(...tags),
  cacheLife: (profile: string): void => cacheLife(profile),
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    menu: {
      get: (location: string): Promise<unknown[]> => menuGet(location),
      getMenu: (
        location: string,
      ): Promise<{
        name: string;
        description?: string | null;
        items: unknown[];
      }> => menuGetMenu(location),
      getMenus: (
        locations: string[],
      ): Promise<
        Array<{
          name: string;
          description?: string | null;
          items: unknown[];
        }>
      > => menuGetMenus(locations),
    },
  },
}));

vi.mock("@/components/headkit-ui/navigation-bar", () => ({
  NavigationBar: (): null => null,
}));
vi.mock("@/components/headkit-ui/header-actions", () => ({
  MobileHeaderActions: (): null => null,
}));
vi.mock("@/components/icon/logo", () => ({ Logo: (): null => null }));
// Merged from staging: nav now composes the per-store logo via @/lib/branding
// (ENG-572). branding.ts is `server-only`, so stub it here — this test guards
// menu cache-tags, not branding.
vi.mock("@/lib/branding", () => ({
  getBranding: vi.fn(async () => ({ storeSettings: { name: null } })),
  getBrandingAssets: vi.fn(async () => ({ logoUrl: null })),
}));

import {
  fetchMenu,
  getFooterMenu,
  getFooterMenus,
  NavigationWrapper,
} from "./navigation-wrapper";

function allTags(): string[] {
  return cacheTag.mock.calls.flat();
}

beforeEach(() => {
  cacheTag.mockClear();
  cacheLife.mockClear();
  menuGet.mockReset();
  menuGet.mockResolvedValue([]);
  menuGetMenu.mockReset();
  menuGetMenu.mockResolvedValue({ name: "", description: null, items: [] });
  menuGetMenus.mockReset();
  menuGetMenus.mockResolvedValue([
    { name: "", description: null, items: [] },
    { name: "", description: null, items: [] },
    { name: "", description: null, items: [] },
  ]);
});

describe("fetchMenu — tagged by location, days backstop", () => {
  it("tags the PRIMARY menu with headkit:menu:PRIMARY at cacheLife('days')", async () => {
    await fetchMenu("PRIMARY");
    expect(cacheTag).toHaveBeenCalledWith("headkit:menu:PRIMARY");
    expect(cacheLife).toHaveBeenCalledWith("days");
  });

  it("tags the SECONDARY menu with headkit:menu:SECONDARY", async () => {
    await fetchMenu("SECONDARY");
    expect(cacheTag).toHaveBeenCalledWith("headkit:menu:SECONDARY");
  });

  it("tags the PRE_HEADER menu with headkit:menu:PRE_HEADER", async () => {
    await fetchMenu("PRE_HEADER");
    expect(cacheTag).toHaveBeenCalledWith("headkit:menu:PRE_HEADER");
  });

  it("degrades to [] when the SDK read throws", async () => {
    menuGet.mockRejectedValueOnce(new Error("boom"));
    await expect(fetchMenu("PRIMARY")).resolves.toEqual([]);
  });
});

describe("getFooterMenus — TAG.footer + all footer locations", () => {
  it("tags footer + FOOTER/FOOTER_2/FOOTER_POLICY at cacheLife('days')", async () => {
    await getFooterMenus();
    expect(cacheTag).toHaveBeenCalledWith(
      "headkit:footer",
      "headkit:menu:FOOTER",
      "headkit:menu:FOOTER_2",
      "headkit:menu:FOOTER_POLICY",
    );
    expect(cacheLife).toHaveBeenCalledWith("days");
  });

  it("fetches all three footer locations and returns stable slots", async () => {
    menuGetMenus.mockResolvedValueOnce([
      {
        name: "Shop",
        description: null,
        items: [{ id: "1", label: "Shop", uri: "/shop", children: [] }],
      },
      { name: "Company", description: null, items: [] },
      {
        name: "Paralel Furniture Pty Ltd",
        description: null,
        items: [{ id: "2", label: "Privacy", uri: "/privacy", children: [] }],
      },
    ]);

    await expect(getFooterMenus()).resolves.toEqual([
      {
        location: "FOOTER",
        name: "Shop",
        items: [{ id: "1", label: "Shop", uri: "/shop" }],
      },
      { location: "FOOTER_2", name: "Company", items: [] },
      {
        location: "FOOTER_POLICY",
        name: "Paralel Furniture Pty Ltd",
        items: [{ id: "2", label: "Privacy", uri: "/privacy" }],
      },
    ]);
    expect(menuGetMenus).toHaveBeenCalledWith([
      "FOOTER",
      "FOOTER_2",
      "FOOTER_POLICY",
    ]);
    expect(menuGet).not.toHaveBeenCalled();
  });
});

describe("getFooterMenu — legacy FOOTER-only helper", () => {
  it("tags the footer data entry with headkit:footer + menu:FOOTER at cacheLife('days')", async () => {
    await getFooterMenu();
    expect(cacheTag).toHaveBeenCalledWith(
      "headkit:footer",
      "headkit:menu:FOOTER",
    );
    expect(cacheLife).toHaveBeenCalledWith("days");
  });

  it("degrades to [] when the SDK read throws", async () => {
    menuGet.mockRejectedValueOnce(new Error("boom"));
    await expect(getFooterMenu()).resolves.toEqual([]);
  });
});

describe("NavigationWrapper — subscribes to the menus it composes", () => {
  it("tags primary + secondary + pre-header + branding and uses cacheLife('days')", async () => {
    await NavigationWrapper();
    expect(cacheTag).toHaveBeenCalledWith(
      "headkit:menu:PRIMARY",
      "headkit:menu:SECONDARY",
      "headkit:menu:PRE_HEADER",
      "headkit:branding",
    );
    expect(cacheLife).toHaveBeenCalledWith("days");
  });

  it("fetches PRIMARY + SECONDARY + PRE_HEADER in one getMenus batch", async () => {
    await NavigationWrapper();
    expect(menuGetMenus).toHaveBeenCalledWith([
      "PRIMARY",
      "SECONDARY",
      "PRE_HEADER",
    ]);
    expect(menuGet).not.toHaveBeenCalled();
    expect(menuGetMenu).not.toHaveBeenCalled();
  });
});

describe("no legacy tag literal drives invalidation", () => {
  it("never passes headkit:navigation or footer-menu to cacheTag", async () => {
    await NavigationWrapper();
    await getFooterMenus();
    const tags = allTags();
    expect(tags).not.toContain("headkit:navigation");
    expect(tags).not.toContain("footer-menu");
  });

  it("never pins a chrome read at cacheLife('max')", async () => {
    await NavigationWrapper();
    await getFooterMenus();
    await fetchMenu("PRIMARY");
    expect(cacheLife).not.toHaveBeenCalledWith("max");
  });
});
