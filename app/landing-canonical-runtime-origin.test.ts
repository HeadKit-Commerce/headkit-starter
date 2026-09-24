import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The four static landing routes (`/sale`, `/new`, `/featured`, `/brand`) used
 * to build their canonical from the build-time `NEXT_PUBLIC_FRONTEND_URL`.
 * That env is inlined at build time, so a store whose custom domain was
 * attached without a redeploy served a canonical naming the stale
 * `*.headkit.app` host while `app/sitemap.ts` advertised the same routes under
 * the customer's apex — a cross-host canonical on a route the sitemap is
 * actively promoting.
 *
 * These cases pin the defect in the only form that can regress silently: the
 * sitemap `<loc>` and the page canonical for the SAME path, compared directly.
 */

// Hoisted, because the `@/lib/env` mock factory below reads it. `vi.mock` is
// lifted above every module-scope `const`, and the factory runs as soon as
// something in the import graph imports `@/lib/env` — a plain `const` here is
// then still in its temporal dead zone ("Cannot access 'BAKED_ENV' before
// initialization"). Which import pulls env first is not this file's to know.
const { BAKED_ENV } = vi.hoisted(() => {
  const baked = "https://stale.headkit.app";
  process.env.NEXT_PUBLIC_FRONTEND_URL = baked;
  return { BAKED_ENV: baked };
});
const RUNTIME_DOMAIN = "customer.com";

vi.mock("server-only", () => ({}));

vi.mock("next/cache", () => ({
  cacheLife: (): void => {},
  cacheTag: (): void => {},
}));

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_FRONTEND_URL: BAKED_ENV },
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    products: { list: vi.fn(async () => ({ products: [] })), get: vi.fn() },
    collections: {
      list: vi.fn(async () => ({ products: [] })),
      getCategories: vi.fn(async () => []),
      getFilters: vi.fn(async () => ({ attributes: [] })),
    },
    brands: { list: vi.fn(async () => ({ brands: [] })) },
    posts: {
      list: vi.fn(async () => ({ posts: [] })),
      getLanding: vi.fn(async () => null),
    },
    projects: { list: vi.fn(async () => ({ projects: [] })) },
    menu: { get: vi.fn(async () => null) },
  },
}));

/** Mutable per test: `null` = store has no custom domain. */
let storeDomain: string | null = RUNTIME_DOMAIN;

vi.mock("@/lib/branding", () => ({
  getBranding: vi.fn(async () => ({
    storeSettings: {
      id: null,
      slug: null,
      name: "Acme",
      gtmId: null,
      domain: storeDomain,
      checkoutType: null,
      cookieConsentEnabled: false,
    },
    seoSettings: {
      title: null,
      description: null,
      ogImageUrl: null,
      enableSitemap: true,
      allowIndexing: true,
      indexNowEnabled: false,
      indexNowKey: null,
    },
  })),
  getBrandingAssets: vi.fn(async () => ({ iconUrl: null })),
}));

import type { Metadata } from "next";

import { generateMetadata as saleMetadata } from "./sale/page";
import { generateMetadata as newMetadata } from "./new/page";
import { generateMetadata as featuredMetadata } from "./featured/page";
import { generateMetadata as brandMetadata } from "./brand/page";
import sitemap from "./sitemap";

const LANDINGS = [
  { path: "/sale", generate: saleMetadata },
  { path: "/new", generate: newMetadata },
  { path: "/featured", generate: featuredMetadata },
  { path: "/brand", generate: brandMetadata },
] as const;

async function canonicalFor(
  generate: () => Promise<Metadata>,
): Promise<string> {
  const metadata = await generate();
  return String(metadata.alternates?.canonical ?? "");
}

describe("landing canonicals use the runtime store domain", () => {
  beforeEach(() => {
    storeDomain = RUNTIME_DOMAIN;
  });

  it.each(LANDINGS)(
    "$path names the runtime domain, not the baked env",
    async ({ path, generate }) => {
      expect(await canonicalFor(generate)).toBe(
        `https://${RUNTIME_DOMAIN}${path}`,
      );
    },
  );

  it("agrees with the sitemap <loc> for the same path", async () => {
    const entries = await sitemap();
    const locByPath = new Map(
      entries.map((entry) => [new URL(entry.url).pathname, entry.url]),
    );

    for (const { path, generate } of LANDINGS) {
      const loc = locByPath.get(path);
      expect(loc, `sitemap must emit ${path}`).toBeDefined();
      expect(await canonicalFor(generate)).toBe(loc);
    }
  });

  it("falls back to the baked env when the store has no custom domain", async () => {
    storeDomain = null;

    for (const { path, generate } of LANDINGS) {
      expect(await canonicalFor(generate)).toBe(`${BAKED_ENV}${path}`);
    }
  });
});
