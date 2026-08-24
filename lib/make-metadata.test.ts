import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  makeSeoMetadata,
  makeRootMetadata,
  seoFallbackDescription,
  resolveCanonical,
  resolveHomeTitle,
  resolveFooterDescription,
  resolveStoreName,
  resolveOgImageUrl,
  isRealSeoTitle,
  resolveRobots,
} from "./make-metadata";
import { setRequestHost } from "@/lib/test-support/request-host";

vi.mock("next/headers", async () => {
  const { currentRequestHeaders } =
    await import("@/lib/test-support/request-host");
  return { headers: async () => currentRequestHeaders() };
});

describe("isRealSeoTitle", () => {
  it("treats WP Home / Homepage as not real SEO", async () => {
    expect(isRealSeoTitle("Home")).toBe(false);
    expect(isRealSeoTitle("Homepage")).toBe(false);
    expect(isRealSeoTitle("  home  ")).toBe(false);
  });

  it("treats empty as not real", async () => {
    expect(isRealSeoTitle("")).toBe(false);
    expect(isRealSeoTitle(null)).toBe(false);
  });

  it("accepts real titles", async () => {
    expect(isRealSeoTitle("Acme Shop")).toBe(true);
    expect(isRealSeoTitle("Welcome to our store")).toBe(true);
  });
});

describe("resolveHomeTitle hierarchy", () => {
  it("uses store name when Yoast title is Home", async () => {
    expect(
      resolveHomeTitle({
        yoastTitle: "Home",
        dashboardTitle: null,
        storeName: "Acme",
      }),
    ).toBe("Acme");
  });

  it("prefers dashboard title over store name when Yoast is Home", async () => {
    expect(
      resolveHomeTitle({
        yoastTitle: "Home",
        dashboardTitle: "Acme Commerce",
        storeName: "Acme",
      }),
    ).toBe("Acme Commerce");
  });

  it("prefers real Yoast title over dashboard", async () => {
    expect(
      resolveHomeTitle({
        yoastTitle: "Shop the latest",
        dashboardTitle: "Dashboard Title",
        storeName: "Acme",
      }),
    ).toBe("Shop the latest");
  });

  it("never returns HeadKit marketing copy as tenant default", async () => {
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
  it("uses dashboard description when set", async () => {
    expect(resolveFooterDescription("Our tagline")).toBe("Our tagline");
  });

  it("renders nothing when the description is empty", async () => {
    expect(resolveFooterDescription("")).toBe("");
    expect(resolveFooterDescription("   ")).toBe("");
    expect(resolveFooterDescription(null)).toBe("");
    expect(resolveFooterDescription(undefined)).toBe("");
  });

  it("never substitutes the store name for a missing description", async () => {
    // The Pebblr rehearsal regression: an unset SEO description printed the
    // dashboard store record ("Pebblrbooth Rehearsal") as the footer blurb.
    expect(resolveFooterDescription(null)).not.toBe(
      resolveStoreName("Pebblrbooth Rehearsal"),
    );
    expect(resolveFooterDescription(null)).not.toBe(resolveStoreName(null));
  });

  it("never uses HeadKit marketing string", async () => {
    const desc = resolveFooterDescription(null);
    expect(desc).not.toMatch(/cloud platform/i);
    expect(desc).not.toMatch(/HeadKit/i);
  });
});

describe("resolveOgImageUrl precedence", () => {
  it("Yoast entity → dashboard → branding icon", async () => {
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

  it("emits absolute OG/Twitter images when dashboard ogImageUrl is set", async () => {
    const meta = await makeRootMetadata({
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

  it("uses branding icon for OG when no ogImageUrl", async () => {
    const meta = await makeRootMetadata({
      siteName: "Acme",
      iconUrl: "https://cdn.example/icon.png",
    });
    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn.example/icon.png" },
    ]);
  });

  it("noindexes when allowIndexing is false", async () => {
    const meta = await makeRootMetadata({
      siteName: "Acme",
      allowIndexing: false,
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });
});

describe("makeSeoMetadata fallback chain (FE-09)", () => {
  it("when Yoast/seo is absent, returns bare entity title for root template", async () => {
    const meta = await makeSeoMetadata(null, {
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

  it("when seo.title includes store brand, uses absolute so template does not double", async () => {
    const meta = await makeSeoMetadata(
      {
        title: "Premium Widgets | Acme",
        metaDesc: "Our finest widgets",
      } as Parameters<typeof makeSeoMetadata>[0],
      { title: "Widgets", description: "All our widgets", storeName: "Acme" },
    );

    expect(meta.title).toEqual({ absolute: "Premium Widgets | Acme" });
    expect(meta.description).toBe("Our finest widgets");
  });

  it("when seo.title is bare page name, keeps segment so template appends | Store", async () => {
    const meta = await makeSeoMetadata(
      {
        title: "Projects",
        metaDesc: "Our projects",
      } as Parameters<typeof makeSeoMetadata>[0],
      { title: "Projects", description: "Our projects", storeName: "Acme" },
    );

    expect(meta.title).toBe("Projects");
    expect(meta.description).toBe("Our projects");
  });

  it("treats seo.title Home as not real and uses bare entity title", async () => {
    const meta = await makeSeoMetadata(
      { title: "Home" } as Parameters<typeof makeSeoMetadata>[0],
      { title: "Widgets", storeName: "Acme" },
    );
    expect(meta.title).toBe("Widgets");
  });

  it("decodes HTML entities in Yoast titles and descriptions", async () => {
    const meta = await makeSeoMetadata(
      {
        title: "Beds &amp; Mattresses &#8211; Acme",
        metaDesc: "Shop beds &amp; mattresses",
        opengraphTitle: "Beds &amp; Mattresses &#8211; Acme",
        twitterTitle: "Beds &amp; Mattresses",
      } as Parameters<typeof makeSeoMetadata>[0],
      { title: "Beds &amp; Mattresses", storeName: "Acme" },
    );

    expect(meta.title).toEqual({ absolute: "Beds & Mattresses – Acme" });
    expect(meta.description).toBe("Shop beds & mattresses");
    expect(meta.openGraph?.title).toBe("Beds & Mattresses – Acme");
    expect(meta.twitter?.title).toBe("Beds & Mattresses");
  });
});

describe("makeRootMetadata title template", () => {
  it("exposes %s | storeName template for child routes", async () => {
    const meta = await makeRootMetadata({
      title: "Acme",
      siteName: "Acme",
    });
    expect(meta.title).toEqual({
      default: "Acme",
      template: "%s | Acme",
    });
  });

  it("decodes HTML entities in root title, description, and siteName", async () => {
    const meta = await makeRootMetadata({
      title: "Acme &#8211; Home",
      description: "Design &amp; build",
      siteName: "Acme &amp; Co",
    });
    expect(meta.title).toEqual({
      default: "Acme – Home",
      template: "%s | Acme & Co",
    });
    expect(meta.description).toBe("Design & build");
    expect(meta.openGraph?.title).toBe("Acme – Home");
    expect(meta.openGraph?.siteName).toBe("Acme & Co");
  });

  it("links RSS feed via alternates.types", async () => {
    const prev = process.env.NEXT_PUBLIC_FRONTEND_URL;
    process.env.NEXT_PUBLIC_FRONTEND_URL = "https://shop.example";
    // SITE_URL is module-scoped — re-importing isn't free; assert shape only
    // when URL may be empty in test env. Presence of the key is the contract.
    const meta = await makeRootMetadata({ siteName: "Acme" });
    expect(meta.alternates?.types?.["application/rss+xml"]).toBeTruthy();
    process.env.NEXT_PUBLIC_FRONTEND_URL = prev;
  });
});

describe("makeSeoMetadata fallback canonical + ogImage overrides (07-01)", () => {
  it("uses fallback.canonical for alternates.canonical + openGraph.url when seo is absent", async () => {
    const meta = await makeSeoMetadata(null, {
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

  it("seo.canonical wins over fallback.canonical when the two share a host", async () => {
    const meta = await makeSeoMetadata(
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

  it("fallback.ogImage populates openGraph.images", async () => {
    const meta = await makeSeoMetadata(null, {
      title: "Performance Jersey",
      ogImage: "https://cdn.example/blue-variation.jpg",
      storeName: "Acme",
    });

    expect(meta.openGraph?.images).toEqual([
      { url: "https://cdn.example/blue-variation.jpg" },
    ]);
  });

  it("entity ogImage beats dashboard ogImageUrl", async () => {
    const meta = await makeSeoMetadata(null, {
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
  it("returns distinct, non-empty defaults for product / category / page", async () => {
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

  it("falls back to the store name when the entity name is empty", async () => {
    const desc = seoFallbackDescription("product", "", "Acme");
    expect(desc).not.toBe("");
    expect(desc).toContain("Acme");
    expect(desc).not.toContain("HeadKit");
  });
});

/**
 * Canonical precedence across hosts.
 *
 * The defect this covers: `normalizeUrl` only re-rooted values starting with
 * `/`, so an ABSOLUTE Yoast canonical — which in a headless store names the
 * WordPress backend — passed through untouched and beat the storefront
 * canonical the route had already computed correctly. Two live rehearsal sites
 * shipped 23 and 33 pages canonicalising to a host the storefront does not own,
 * with `og:url` misattributed to the same host. A test with a Yoast canonical
 * on a DIFFERENT host would have caught it, so that case is the centrepiece
 * here.
 */
describe("resolveCanonical host handling", () => {
  const SITE = "https://shop.example";

  it("re-roots a relative CMS canonical onto the storefront", async () => {
    expect(resolveCanonical({ seoCanonical: "/faq", siteUrl: SITE })).toBe(
      "https://shop.example/faq",
    );
  });

  it("keeps a same-host absolute CMS canonical (deliberate editorial choice)", async () => {
    // An editor canonicalising one page onto another must still be honoured;
    // the bug was accepting a FOREIGN host, not accepting Yoast at all.
    expect(
      resolveCanonical({
        seoCanonical: "https://shop.example/preferred-page",
        fallbackCanonical: "https://shop.example/duplicate-page",
        siteUrl: SITE,
      }),
    ).toBe("https://shop.example/preferred-page");
  });

  it("discards a foreign-host CMS canonical in favour of the route's own", async () => {
    expect(
      resolveCanonical({
        seoCanonical: "https://wp-backend.example.com/shop/cat/gold-package/",
        fallbackCanonical: "https://shop.example/shop/cat/gold-package",
        siteUrl: SITE,
      }),
    ).toBe("https://shop.example/shop/cat/gold-package");
  });

  it("keeps the route's canonical when the foreign path does not map to a storefront route", async () => {
    // WordPress serves a post at `/my-post/`; this storefront serves it at
    // `/news/my-post`. Re-rooting the WP path alone would have canonicalised
    // every article to a not-found URL.
    expect(
      resolveCanonical({
        seoCanonical: "https://wp-backend.example.com/my-post/",
        fallbackCanonical: "https://shop.example/news/my-post",
        siteUrl: SITE,
      }),
    ).toBe("https://shop.example/news/my-post");
  });

  it("re-roots a foreign-host path only when the route supplied no canonical", async () => {
    expect(
      resolveCanonical({
        seoCanonical: "https://wp-backend.example.com/about/",
        siteUrl: SITE,
      }),
    ).toBe("https://shop.example/about/");
  });

  it("treats a protocol-relative CMS canonical as a foreign host, not a path", async () => {
    expect(
      resolveCanonical({
        seoCanonical: "//wp-backend.example.com/about",
        fallbackCanonical: "/about",
        siteUrl: SITE,
      }),
    ).toBe("https://shop.example/about");
  });

  it("falls back to the route's canonical for an unusable CMS value", async () => {
    expect(
      resolveCanonical({
        seoCanonical: "javascript:alert(1)",
        fallbackCanonical: "/about",
        siteUrl: SITE,
      }),
    ).toBe("https://shop.example/about");
  });

  it("uses the route's canonical when the CMS supplies none", async () => {
    expect(
      resolveCanonical({
        fallbackCanonical: "/collections/dish-brushes",
        siteUrl: SITE,
      }),
    ).toBe("https://shop.example/collections/dish-brushes");
  });

  it("returns undefined when neither source supplies one", async () => {
    expect(resolveCanonical({ siteUrl: SITE })).toBeUndefined();
  });

  it("leaves the CMS value alone when the storefront origin is unknown", async () => {
    // NEXT_PUBLIC_FRONTEND_URL unset: no host judgement is possible, so do not
    // rewrite on a guess.
    expect(
      resolveCanonical({
        seoCanonical: "https://wp-backend.example.com/about/",
        fallbackCanonical: "/about",
        siteUrl: "",
      }),
    ).toBe("https://wp-backend.example.com/about/");
  });

  it("never emits an off-domain canonical when the origin IS known", async () => {
    for (const seoCanonical of [
      "https://wp-backend.example.com/about/",
      "//wp-backend.example.com/about",
      "http://other.example/x",
    ]) {
      const result = resolveCanonical({ seoCanonical, siteUrl: SITE });
      expect(result?.startsWith(SITE)).toBe(true);
    }
  });
});

describe("makeSeoMetadata canonical + og:url follow resolveCanonical", () => {
  // SITE_URL is read at module scope, so this suite re-imports the module with
  // NEXT_PUBLIC_FRONTEND_URL set — the rest of the file runs with it unset.
  async function withSiteUrl(
    siteUrl: string,
  ): Promise<typeof import("./make-metadata")> {
    process.env.NEXT_PUBLIC_FRONTEND_URL = siteUrl;
    vi.resetModules();
    return import("./make-metadata");
  }

  const prevSiteUrl = process.env.NEXT_PUBLIC_FRONTEND_URL;
  afterEach(() => {
    if (prevSiteUrl === undefined) delete process.env.NEXT_PUBLIC_FRONTEND_URL;
    else process.env.NEXT_PUBLIC_FRONTEND_URL = prevSiteUrl;
    vi.resetModules();
  });

  it("a foreign-host Yoast canonical does not reach alternates or og:url", async () => {
    const mod = await withSiteUrl("https://shop.example");
    const meta = await mod.makeSeoMetadata(
      {
        canonical: "https://wp-backend.example.com/shop/cat/gold-package/",
      } as Parameters<typeof makeSeoMetadata>[0],
      {
        title: "Gold Package",
        canonical: "https://shop.example/shop/cat/gold-package",
        storeName: "Acme",
      },
    );

    expect(meta.alternates?.canonical).toBe(
      "https://shop.example/shop/cat/gold-package",
    );
    // og:url is derived from the same value, so social shares were misattributed
    // to the WordPress host too.
    expect(meta.openGraph?.url).toBe(
      "https://shop.example/shop/cat/gold-package",
    );
  });

  it("storefrontUrl builds an absolute self-canonical from a path", async () => {
    const mod = await withSiteUrl("https://shop.example/");
    expect(mod.storefrontUrl("/about")).toBe("https://shop.example/about");
    expect(mod.storefrontUrl("/")).toBe("https://shop.example/");
  });

  it("storefrontUrl degrades to the bare path when the origin is unset", async () => {
    const mod = await withSiteUrl("");
    expect(mod.storefrontUrl("/about")).toBe("/about");
  });

  it("storefrontUrl prefers the runtime store domain over the baked env", async () => {
    // NEXT_PUBLIC_FRONTEND_URL is inlined at build time, so a custom domain
    // attached without a redeploy leaves it naming the old provisioning host.
    // The sitemap and robots.txt already resolve the runtime store domain
    // first; a canonical resolved from the stale env would then point every
    // high-value page at a host the sitemap does not advertise.
    const mod = await withSiteUrl("https://stale.headkit.app");
    expect(mod.storefrontUrl("/about", "customer.com")).toBe(
      "https://customer.com/about",
    );
    expect(
      mod.storefrontUrl("/about", null),
      "no runtime domain still falls back to the baked env",
    ).toBe("https://stale.headkit.app/about");
  });

  it("judges the Yoast host against the runtime store domain, not the baked env", async () => {
    const mod = await withSiteUrl("https://stale.headkit.app");
    const meta = await mod.makeSeoMetadata(
      {
        canonical: "https://customer.com/preferred-page",
      } as Parameters<typeof makeSeoMetadata>[0],
      {
        title: "About",
        canonical: "https://customer.com/about",
        siteUrl: "customer.com",
      },
    );

    expect(
      meta.alternates?.canonical,
      "the live host is the storefront host, so an editorial cross-page canonical on it is honoured",
    ).toBe("https://customer.com/preferred-page");
    expect(meta.metadataBase?.toString()).toBe("https://customer.com/");
  });

  it("still rejects a foreign Yoast canonical when only the runtime domain is known", async () => {
    // NEXT_PUBLIC_FRONTEND_URL is optional in lib/env.ts. Without the runtime
    // domain there is no origin to compare against, so the WordPress canonical
    // passed straight through — the exact P0 this rule exists to close.
    const mod = await withSiteUrl("");
    const withoutDomain = await mod.makeSeoMetadata(
      {
        canonical: "https://wp-backend.example.com/about/",
      } as Parameters<typeof makeSeoMetadata>[0],
      { title: "About", canonical: "/about" },
    );
    expect(withoutDomain.alternates?.canonical).toBe(
      "https://wp-backend.example.com/about/",
    );

    const withDomain = await mod.makeSeoMetadata(
      {
        canonical: "https://wp-backend.example.com/about/",
      } as Parameters<typeof makeSeoMetadata>[0],
      {
        title: "About",
        canonical: mod.storefrontUrl("/about", "customer.com"),
        siteUrl: "customer.com",
      },
    );
    expect(withDomain.alternates?.canonical).toBe("https://customer.com/about");
    expect(withDomain.openGraph?.url).toBe("https://customer.com/about");
  });

  it("falls back to localhost when the baked env is unusable, instead of throwing", async () => {
    // A malformed NEXT_PUBLIC_FRONTEND_URL is rejected by the origin resolver,
    // so metadataBase must fall through to the localhost default. Handing the
    // raw value to `new URL` throws out of generateMetadata, and the CMS
    // routes have no try/catch around makeSeoMetadata.
    const mod = await withSiteUrl("not a url");

    await expect(
      mod.makeSeoMetadata(null, { title: "About" }),
    ).resolves.toBeDefined();
    expect(
      (
        await mod.makeSeoMetadata(null, { title: "About" })
      ).metadataBase?.toString(),
    ).toBe("http://localhost:3000/");
    await expect(
      mod.makeRootMetadata({ siteName: "Acme" }),
    ).resolves.toBeDefined();
    expect(
      (
        await mod.makeRootMetadata({ siteName: "Acme" })
      ).metadataBase?.toString(),
    ).toBe("http://localhost:3000/");
  });

  it("makeRootMetadata resolves metadataBase and the feed from the runtime domain", async () => {
    const mod = await withSiteUrl("https://stale.headkit.app");
    const meta = await mod.makeRootMetadata({
      siteName: "Acme",
      siteUrl: "customer.com",
      canonical: mod.storefrontUrl("/", "customer.com"),
    });

    expect(meta.metadataBase?.toString()).toBe("https://customer.com/");
    expect(meta.alternates?.canonical).toBe("https://customer.com/");
    expect(meta.alternates?.types?.["application/rss+xml"]).toBe(
      "https://customer.com/feed.xml",
    );
  });
});

/**
 * The store-level indexing switch must reach every page.
 *
 * `makeSeoMetadata` used to ALWAYS emit `robots`, defaulting to index when the
 * caller omitted the flag. Because a page-level `robots` overrides the root
 * layout's, five route families published `index, follow` on stores whose
 * dashboard switch was off. Omitting the key (rather than emitting `undefined`)
 * is what makes Next inherit the layout's value: its metadata merge only walks
 * keys PRESENT on the object.
 */
describe("makeSeoMetadata robots wiring", () => {
  const prevEnv = process.env.VERCEL_ENV;
  beforeEach(() => {
    // A rehearsal storefront IS a Vercel production deployment, so every case
    // below runs with the variable that used to decide this set to production.
    process.env.VERCEL_ENV = "production";
    setRequestHost("customer.com");
  });
  afterEach(() => {
    if (prevEnv === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevEnv;
    setRequestHost(null);
  });

  it("omits the robots KEY entirely when allowIndexing is not passed", async () => {
    const meta = await makeSeoMetadata(null, {
      title: "About",
      storeName: "Acme",
    });
    expect("robots" in meta).toBe(false);
  });

  it("indexes on the store's own host when allowIndexing is true", async () => {
    const meta = await makeSeoMetadata(null, {
      title: "About",
      storeName: "Acme",
      allowIndexing: true,
      siteUrl: "customer.com",
    });
    expect(meta.robots).toEqual({ index: true, follow: true });
  });

  it("noindexes when allowIndexing is false on an indexable host", async () => {
    const meta = await makeSeoMetadata(null, {
      title: "About",
      storeName: "Acme",
      allowIndexing: false,
      siteUrl: "customer.com",
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("noindexes a rehearsal host even with allowIndexing true and VERCEL_ENV=production", async () => {
    // ENG-868 / ENG-876: the rehearsal deployment is production, and the host
    // gate must win regardless.
    setRequestHost("acme-rehearsal.headkit.app");
    const meta = await makeSeoMetadata(null, {
      title: "About",
      storeName: "Acme",
      allowIndexing: true,
      siteUrl: "customer.com",
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("noindexes when no request host is available (fails closed)", async () => {
    setRequestHost(null);
    const meta = await makeSeoMetadata(null, {
      title: "About",
      storeName: "Acme",
      allowIndexing: true,
      siteUrl: "customer.com",
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("noindexes when the store switch is unknown, even on the store's own host", async () => {
    // The degraded branch of app/layout.tsx / app/page.tsx builds root metadata
    // with no branding read, so the switch is unknown. app/robots.ts answers
    // that same failure with `Disallow: /`; an omitted switch must not resolve
    // to `index, follow` beside it. The host gate is satisfied here, so the
    // unknown switch is the only thing closing indexing.
    const meta = await makeRootMetadata({
      siteName: "Store",
      siteUrl: "customer.com",
    });
    expect(meta.robots).toEqual({ index: false, follow: false });
  });

  it("throws when a call site omits the origin instead of quietly noindexing", async () => {
    // Regression guard for the shape of this class of bug: a caller that never
    // passed the origin still compiled and still returned a well-formed answer
    // — `noindex, nofollow` on the store's live host — so nothing could catch
    // it. Omission must now fail loudly. Cast because the type already rejects
    // it; this pins the RUNTIME behaviour a JS caller would hit.
    const omitted = resolveRobots as unknown as (
      allowIndexing: boolean,
    ) => Promise<unknown>;

    await expect(omitted(true)).rejects.toThrow(TypeError);
    // ...and the store switch being off must not short-circuit past the guard.
    await expect(omitted(false)).rejects.toThrow(TypeError);
  });

  it("still fails closed, without throwing, when the store declares no origin", async () => {
    // `null` / `""` are honest values — a store with no domain and no baked
    // env — and must stay a quiet `noindex`, not a crash.
    await expect(resolveRobots(true, null)).resolves.toEqual({
      index: false,
      follow: false,
    });
    await expect(resolveRobots(true, "")).resolves.toEqual({
      index: false,
      follow: false,
    });
  });

  it("applies the same gate to makeRootMetadata", async () => {
    setRequestHost("acme-rehearsal.headkit.app");
    const rehearsal = await makeRootMetadata({
      siteName: "Acme",
      allowIndexing: true,
      siteUrl: "customer.com",
    });
    expect(rehearsal.robots).toEqual({ index: false, follow: false });

    setRequestHost("customer.com");
    const live = await makeRootMetadata({
      siteName: "Acme",
      allowIndexing: true,
      siteUrl: "customer.com",
    });
    expect(live.robots).toEqual({ index: true, follow: true });
  });
});

describe("makeRootMetadata canonical (home self-reference)", () => {
  it("emits no canonical when none is passed (layout must not set one)", async () => {
    // A layout-level canonical would be inherited by every route whose own
    // metadata omits `alternates`, pointing them all at the homepage.
    const meta = await makeRootMetadata({ siteName: "Acme" });
    expect(meta.alternates?.canonical).toBeUndefined();
  });

  it("emits the canonical the page passes, alongside the RSS alternate", async () => {
    const meta = await makeRootMetadata({
      siteName: "Acme",
      canonical: "https://shop.example/",
    });
    expect(meta.alternates?.canonical).toBe("https://shop.example/");
    expect(meta.alternates?.types?.["application/rss+xml"]).toBeTruthy();
  });
});
