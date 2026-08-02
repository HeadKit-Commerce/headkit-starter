import { describe, expect, it, beforeEach, afterEach } from "vitest";
import {
  makeSeoMetadata,
  makeRootMetadata,
  seoFallbackDescription,
  resolveHomeTitle,
  resolveFooterDescription,
  resolveOgImageUrl,
  isRealSeoTitle,
} from "./make-metadata";

describe("isRealSeoTitle", () => {
  it("treats WP Home / Homepage as not real SEO", () => {
    expect(isRealSeoTitle("Home")).toBe(false);
    expect(isRealSeoTitle("Homepage")).toBe(false);
    expect(isRealSeoTitle("  home  ")).toBe(false);
  });

  it("treats empty as not real", () => {
    expect(isRealSeoTitle("")).toBe(false);
    expect(isRealSeoTitle(null)).toBe(false);
  });

  it("accepts real titles", () => {
    expect(isRealSeoTitle("Acme Shop")).toBe(true);
    expect(isRealSeoTitle("Welcome to our store")).toBe(true);
  });
});

describe("resolveHomeTitle hierarchy", () => {
  it("uses store name when Yoast title is Home", () => {
    expect(
      resolveHomeTitle({
        yoastTitle: "Home",
        dashboardTitle: null,
        storeName: "Acme",
      }),
    ).toBe("Acme");
  });

  it("prefers dashboard title over store name when Yoast is Home", () => {
    expect(
      resolveHomeTitle({
        yoastTitle: "Home",
        dashboardTitle: "Acme Commerce",
        storeName: "Acme",
      }),
    ).toBe("Acme Commerce");
  });

  it("prefers real Yoast title over dashboard", () => {
    expect(
      resolveHomeTitle({
        yoastTitle: "Shop the latest",
        dashboardTitle: "Dashboard Title",
        storeName: "Acme",
      }),
    ).toBe("Shop the latest");
  });

  it("never returns HeadKit marketing copy as tenant default", () => {
    const title = resolveHomeTitle({
      yoastTitle: "Home",
      dashboardTitle: null,
      storeName: null,
    });
    expect(title).toBe("Store");
    expect(title).not.toMatch(/HeadKit/i);
  });
});

describe("resolveFooterDescription", () => {
  it("uses dashboard description when set", () => {
    expect(resolveFooterDescription("Our tagline", "Acme")).toBe("Our tagline");
  });

  it("falls back to store name only when description empty", () => {
    expect(resolveFooterDescription("", "Acme")).toBe("Acme");
    expect(resolveFooterDescription(null, "Acme")).toBe("Acme");
  });

  it("never uses HeadKit marketing string", () => {
    const desc = resolveFooterDescription(null, null);
    expect(desc).toBe("Store");
    expect(desc).not.toMatch(/cloud platform/i);
    expect(desc).not.toMatch(/HeadKit/i);
  });
});

describe("resolveOgImageUrl precedence", () => {
  it("Yoast entity → dashboard → branding icon", () => {
    expect(
      resolveOgImageUrl({
        entityImageUrl: "https://cdn.example/yoast.jpg",
        dashboardOgImageUrl: "https://cdn.example/dash.jpg",
        brandingIconUrl: "https://cdn.example/icon.png",
      }),
    ).toBe("https://cdn.example/yoast.jpg");

    expect(
      resolveOgImageUrl({
        entityImageUrl: null,
        dashboardOgImageUrl: "https://cdn.example/dash.jpg",
        brandingIconUrl: "https://cdn.example/icon.png",
      }),
    ).toBe("https://cdn.example/dash.jpg");

    expect(
      resolveOgImageUrl({
        entityImageUrl: null,
        dashboardOgImageUrl: null,
        brandingIconUrl: "https://cdn.example/icon.png",
      }),
    ).toBe("https://cdn.example/icon.png");

    expect(
      resolveOgImageUrl({
        entityImageUrl: null,
        dashboardOgImageUrl: null,
        brandingIconUrl: null,
      }),
    ).toBeUndefined();
  });
});

describe("makeRootMetadata OG + store name", () => {
  const prevEnv = process.env.VERCEL_ENV;

  beforeEach(() => {
    process.env.VERCEL_ENV = "production";
  });

  afterEach(() => {
    process.env.VERCEL_ENV = prevEnv;
  });

  it("emits absolute OG/Twitter images when dashboard ogImageUrl is set", () => {
    const meta = makeRootMetadata({
      title: "Acme",
      siteName: "Acme",
      ogImageUrl: "https://cdn.example/og.jpg",
    });

    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn.example/og.jpg" },
    ]);
    expect(meta.twitter?.images).toEqual(["https://cdn.example/og.jpg"]);
    expect(meta.openGraph?.siteName).toBe("Acme");
  });

  it("uses branding icon for OG when no ogImageUrl", () => {
    const meta = makeRootMetadata({
      siteName: "Acme",
      iconUrl: "https://cdn.example/icon.png",
    });
    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn.example/icon.png" },
    ]);
  });

  it("noindexes when allowIndexing is false", () => {
    const meta = makeRootMetadata({
      siteName: "Acme",
      allowIndexing: false,
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("makeSeoMetadata fallback chain (FE-09)", () => {
  it("when Yoast/seo is absent, returns bare entity title for root template", () => {
    const meta = makeSeoMetadata(null, {
      title: "Widgets",
      description: "All our widgets",
      storeName: "Acme",
    });

    // Root layout template `%s | {storeName}` appends the store suffix at render.
    expect(meta.title).toBe("Widgets");
    expect(meta.description).toBe("All our widgets");
    expect(meta.openGraph?.siteName).toBe("Acme");
    expect(meta.openGraph?.title).toBe("Widgets");
  });

  it("when seo.title is present, uses absolute so template does not double", () => {
    const meta = makeSeoMetadata(
      {
        title: "Premium Widgets",
        metaDesc: "Our finest widgets",
      } as Parameters<typeof makeSeoMetadata>[0],
      { title: "Widgets", description: "All our widgets", storeName: "Acme" },
    );

    expect(meta.title).toEqual({ absolute: "Premium Widgets" });
    expect(meta.description).toBe("Our finest widgets");
  });

  it("treats seo.title Home as not real and uses bare entity title", () => {
    const meta = makeSeoMetadata(
      { title: "Home" } as Parameters<typeof makeSeoMetadata>[0],
      { title: "Widgets", storeName: "Acme" },
    );
    expect(meta.title).toBe("Widgets");
  });
});

describe("makeRootMetadata title template", () => {
  it("exposes %s | storeName template for child routes", () => {
    const meta = makeRootMetadata({
      title: "Acme",
      siteName: "Acme",
    });
    expect(meta.title).toEqual({
      default: "Acme",
      template: "%s | Acme",
    });
  });

  it("links RSS feed via alternates.types", () => {
    const prev = process.env.NEXT_PUBLIC_FRONTEND_URL;
    process.env.NEXT_PUBLIC_FRONTEND_URL = "https://shop.example";
    // SITE_URL is module-scoped — re-importing isn't free; assert shape only
    // when URL may be empty in test env. Presence of the key is the contract.
    const meta = makeRootMetadata({ siteName: "Acme" });
    expect(meta.alternates?.types?.["application/rss+xml"]).toBeTruthy();
    process.env.NEXT_PUBLIC_FRONTEND_URL = prev;
  });
});

describe("makeSeoMetadata fallback canonical + ogImage overrides (07-01)", () => {
  it("uses fallback.canonical for alternates.canonical + openGraph.url when seo is absent", () => {
    const meta = makeSeoMetadata(null, {
      title: "Performance Jersey",
      canonical: "https://shop.example/products/performance-jersey/blue",
      storeName: "Acme",
    });

    expect(meta.alternates?.canonical).toBe(
      "https://shop.example/products/performance-jersey/blue",
    );
    expect(meta.openGraph?.url).toBe(
      "https://shop.example/products/performance-jersey/blue",
    );
  });

  it("seo.canonical still wins over fallback.canonical (precedence preserved)", () => {
    const meta = makeSeoMetadata(
      {
        canonical: "https://shop.example/seo-canonical",
      } as Parameters<typeof makeSeoMetadata>[0],
      {
        title: "Performance Jersey",
        canonical: "https://shop.example/products/performance-jersey/blue",
        storeName: "Acme",
      },
    );

    expect(meta.alternates?.canonical).toBe(
      "https://shop.example/seo-canonical",
    );
    expect(meta.openGraph?.url).toBe("https://shop.example/seo-canonical");
  });

  it("fallback.ogImage populates openGraph.images", () => {
    const meta = makeSeoMetadata(null, {
      title: "Performance Jersey",
      ogImage: "https://cdn.example/blue-variation.jpg",
      storeName: "Acme",
    });

    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn.example/blue-variation.jpg" },
    ]);
  });

  it("entity ogImage beats dashboard ogImageUrl", () => {
    const meta = makeSeoMetadata(null, {
      title: "Jersey",
      ogImage: "https://cdn.example/entity.jpg",
      dashboardOgImageUrl: "https://cdn.example/dash.jpg",
      brandingIconUrl: "https://cdn.example/icon.png",
      storeName: "Acme",
    });
    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn.example/entity.jpg" },
    ]);
  });
});

describe("seoFallbackDescription per-entity templates (FE-09 / D-04)", () => {
  it("returns distinct, non-empty defaults for product / category / page", () => {
    const product = seoFallbackDescription("product", "Widgets", "Acme");
    const category = seoFallbackDescription("category", "Widgets", "Acme");
    const page = seoFallbackDescription("page", "About Us", "Acme");

    expect(product).not.toBe("");
    expect(category).not.toBe("");
    expect(page).not.toBe("");
    expect(new Set([product, category, page]).size).toBe(3);
    expect(product).toContain("Widgets");
    expect(product).toContain("Acme");
    expect(category).toContain("Widgets");
    expect(page).toContain("About Us");
  });

  it("falls back to the store name when the entity name is empty", () => {
    const desc = seoFallbackDescription("product", "", "Acme");
    expect(desc).not.toBe("");
    expect(desc).toContain("Acme");
    expect(desc).not.toContain("HeadKit");
  });
});
