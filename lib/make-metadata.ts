import type { Metadata } from "next";
import type { SeoData } from "@headkit/sdk";
import { decodeHtmlEntities } from "@/lib/utils";
import { isIndexableCurrentHost } from "@/lib/indexing-decision";
import { normalizeSiteUrl, resolveSiteUrl } from "@/lib/site-url";

const SITE_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "";

/**
 * Provider CMS titles that are not real SEO — fall through to dashboard /
 * store name. Applies to Woo (WP defaults) and Shopify Online Store pages
 * titled "Home" / "Homepage".
 */
const GENERIC_SEO_TITLES = new Set([
  "home",
  "homepage",
  "untitled",
  "auto draft",
  "auto-draft",
]);

export type SeoEntityType = "product" | "category" | "page";

/**
 * Optional SEO string under `exactOptionalPropertyTypes`.
 * Call sites often pass `x?.field` (`string | undefined`) or `x ?? null`.
 */
type OptSeoStr = string | null | undefined;

/** Decode + trim CMS/Yoast strings so entities never leak into `<title>` / OG. */
function seoText(value?: OptSeoStr): string {
  return decodeHtmlEntities(value ?? "").trim();
}

function stripTags(html?: OptSeoStr): string {
  return seoText(html).replace(/<[^>]*>/g, "");
}

function normalizeUrl(url?: OptSeoStr): string | undefined {
  if (!url) return undefined;
  if (url.startsWith("/")) return `${SITE_URL}${url}`;
  return url;
}

/**
 * Absolute storefront URL for a site-relative path — the self-referencing
 * canonical a route emits when neither the CMS nor a more specific rule
 * supplies one.
 *
 * `storeDomain` is the RUNTIME store domain (`storeSettings.domain` from
 * `getBranding()`), and it wins over the build-time `NEXT_PUBLIC_FRONTEND_URL`
 * exactly as it does in `app/robots.ts` and `app/sitemap.ts`. That env value is
 * inlined at build time, so a custom domain attached without a redeploy leaves
 * it naming the old `*.headkit.app` host — which would put a cross-host
 * canonical on every page the sitemap advertises under the customer's apex.
 * Pass it at every call site; omitting it falls back to the baked env.
 *
 * Returns the bare path when neither origin is usable, which Next resolves
 * against `metadataBase`; it can never return a foreign origin.
 */
export function storefrontUrl(
  path: string,
  storeDomain?: string | null,
): string {
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const site = resolveSiteUrl(storeDomain, SITE_URL);
  return site ? `${site}${suffix}` : suffix;
}

/**
 * Pick the canonical URL for a page from the CMS (Yoast) value and the one the
 * route computed for itself.
 *
 * The rule, and why it is not simply "the caller always wins":
 *
 * - A **relative** CMS canonical (`/faq`) is storefront-relative by
 *   definition — re-root it onto the storefront origin.
 * - **Absolute on the storefront host** is a deliberate editorial choice (an
 *   editor canonicalising one page onto another). Honour it.
 * - **Absolute on any other host** is the headless failure mode: Yoast emits
 *   the WordPress *backend* permalink, a host the storefront does not own and
 *   whose path need not match a storefront route at all — WordPress serves a
 *   post at `/my-post/` where this app serves it at `/news/my-post`. Re-rooting
 *   the path alone would therefore land on a URL that does not exist, so the
 *   route's own canonical — self-referential by construction — wins instead.
 *   Only when the route supplied none do we fall back to re-rooting the
 *   foreign path, which at least keeps the signal on-domain.
 * - When the storefront origin is unknown (no runtime store domain and no
 *   `NEXT_PUBLIC_FRONTEND_URL`) no host judgement is possible, so the CMS value
 *   passes through unchanged rather than being rewritten on a guess. Callers
 *   should therefore always supply `siteUrl` from the runtime store domain:
 *   `NEXT_PUBLIC_FRONTEND_URL` is optional in `lib/env.ts`, and a store running
 *   without it would otherwise re-open the foreign-canonical bug this rule
 *   exists to close.
 *
 * A canonical pointing off-domain is never correct, so this only ever emits
 * the storefront origin, a bare path, or nothing.
 */
export function resolveCanonical(options: {
  /** `seo.canonical` as returned by the CMS/Yoast. */
  seoCanonical?: OptSeoStr;
  /** The canonical the route computed for itself. */
  fallbackCanonical?: OptSeoStr;
  /**
   * Storefront origin, already resolved (runtime store domain preferred over
   * the build-time env — see {@link storefrontUrl}). Defaults to
   * `NEXT_PUBLIC_FRONTEND_URL`; an empty string means "origin unknown".
   */
  siteUrl?: string | undefined;
}): string | undefined {
  const site = normalizeSiteUrl(options.siteUrl ?? SITE_URL);
  const rootRelative = (value?: OptSeoStr): string | undefined => {
    const trimmed = (value ?? "").trim();
    if (!trimmed) return undefined;
    if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
      return site ? `${site}${trimmed}` : trimmed;
    }
    return trimmed;
  };

  const fallback = rootRelative(options.fallbackCanonical);
  const seo = (options.seoCanonical ?? "").trim();
  if (!seo) return fallback;

  // Storefront-relative — never ambiguous.
  if (seo.startsWith("/") && !seo.startsWith("//")) {
    return site ? `${site}${seo}` : seo;
  }

  let parsed: URL | null = null;
  try {
    // Protocol-relative (`//host/path`) is an absolute URL, not a path.
    parsed = new URL(seo.startsWith("//") ? `https:${seo}` : seo);
  } catch {
    parsed = null;
  }
  // Unusable CMS value (`javascript:`, malformed): the route's own URL is the
  // only safe thing left to emit.
  if (
    !parsed ||
    (parsed.protocol !== "http:" && parsed.protocol !== "https:")
  ) {
    return fallback;
  }

  // No storefront origin to compare against — leave the value alone.
  if (!site) return seo;

  const seoOrigin = `${parsed.protocol}//${parsed.host}`;
  if (seoOrigin === site) return seo;

  return fallback ?? `${site}${parsed.pathname}${parsed.search}`;
}

/** True when a provider CMS title is real SEO (not empty or a generic default). */
export function isRealSeoTitle(title?: OptSeoStr): boolean {
  const trimmed = (title ?? "").trim();
  if (!trimmed) return false;
  return !GENERIC_SEO_TITLES.has(trimmed.toLowerCase());
}

/**
 * True when a CMS/Yoast title already includes the store brand so the root
 * `%s | {storeName}` template must not append again (use `absolute` instead).
 */
export function titleIncludesStoreBrand(
  title: string,
  storeName: string,
): boolean {
  const t = title.trim().toLowerCase();
  const s = storeName.trim().toLowerCase();
  if (!t || !s) return false;
  return (
    t.includes(`| ${s}`) ||
    t.includes(` - ${s}`) ||
    t.includes(` – ${s}`) ||
    t.includes(` — ${s}`) ||
    t.endsWith(` ${s}`) ||
    t === s
  );
}

/**
 * Resolve the store display name used in titles / fallbacks.
 * Never returns HeadKit marketing copy as a tenant default.
 */
export function resolveStoreName(storeName?: OptSeoStr): string {
  const trimmed = seoText(storeName);
  return trimmed.length > 0 ? trimmed : "Store";
}

/**
 * Footer blurb: the dashboard SEO description, or nothing.
 *
 * Returns "" when no description is set so the footer renders no paragraph at
 * all. It must never fall back to the store name — that printed the dashboard
 * store record where a brand paragraph belongs — nor to HeadKit marketing copy.
 */
export function resolveFooterDescription(seoDescription?: OptSeoStr): string {
  return seoText(seoDescription);
}

/**
 * Storefront SEO hierarchy (matches Woo + Shopify):
 * 1. Built-in starter fallbacks (`seoFallbackTitle` / `seoFallbackDescription`)
 * 2. Provider SEO — Woo Yoast/Rank Math **or** Shopify Admin search-engine
 *    listing on shop / page / product / article / collection
 * 3. HeadKit dashboard SEO title / description / OG / `allowIndexing`
 *
 * `yoastTitle` / `yoastDescription` remain the param names for call-site
 * compatibility; they mean “provider CMS SEO”, not Woo-only.
 */
export function resolveHomeTitle(options: {
  yoastTitle?: OptSeoStr;
  /** Alias for {@link yoastTitle} (provider SEO title). */
  providerTitle?: OptSeoStr;
  dashboardTitle?: OptSeoStr;
  storeName?: OptSeoStr;
}): string {
  const provider = seoText(options.providerTitle ?? options.yoastTitle);
  if (isRealSeoTitle(provider)) {
    return provider;
  }
  const dashboard = seoText(options.dashboardTitle);
  if (dashboard) return dashboard;
  return resolveStoreName(options.storeName);
}

/**
 * Home description hierarchy: provider metaDesc → dashboard description → empty
 * (layout/OG can still omit empty description; never HeadKit marketing copy).
 */
export function resolveHomeDescription(options: {
  yoastDescription?: OptSeoStr;
  /** Alias for {@link yoastDescription} (provider SEO description). */
  providerDescription?: OptSeoStr;
  dashboardDescription?: OptSeoStr;
}): string {
  const provider = seoText(
    options.providerDescription ?? options.yoastDescription,
  );
  if (provider) return provider;
  return seoText(options.dashboardDescription);
}

/**
 * OG / Twitter image precedence:
 * Provider entity image → dashboard `ogImageUrl` → branding icon → none.
 */
export function resolveOgImageUrl(options: {
  entityImageUrl?: OptSeoStr;
  dashboardOgImageUrl?: OptSeoStr;
  brandingIconUrl?: OptSeoStr;
}): string | undefined {
  return (
    normalizeUrl(options.entityImageUrl) ??
    normalizeUrl(options.dashboardOgImageUrl) ??
    normalizeUrl(options.brandingIconUrl)
  );
}

/**
 * HTML `robots` meta — the SAME host decision `app/robots.ts` uses (ENG-868).
 *
 * Both inputs can only CLOSE indexing, and only both agreeing opens it:
 *  - the host gate ({@link isIndexableCurrentHost}) — a rehearsal / unknown
 *    host is `noindex, nofollow` whatever the store says;
 *  - the store switch (`allowIndexing`) — a store with indexing turned off
 *    stays off even on its own production host.
 *
 * `VERCEL_ENV` is deliberately not read: a rehearsal storefront is a Vercel
 * *production* deployment on a temporary host, so keying on it waved through
 * exactly the case `robots.txt` was refusing — the two signals disagreed by
 * construction.
 *
 * Both arguments are REQUIRED, and `configuredUrl` is typed without
 * `undefined`. A caller that forgot the origin used to still compile and still
 * return a well-formed answer — the WRONG one, `noindex, nofollow` on the
 * store's own live host — so the omission was invisible to the type checker and
 * to every assertion. It now fails loudly instead (see
 * {@link isIndexableCurrentHost}); `null` / `""` remain the honest "this store
 * declares no origin" value and still fail closed.
 *
 * @param allowIndexing store-level “show on search engines”
 * @param configuredUrl the store's declared frontend origin, already resolved
 *   through `resolveSiteUrl` so it matches what `app/robots.ts` compares.
 */
export async function resolveRobots(
  allowIndexing: boolean,
  configuredUrl: string | null,
): Promise<Metadata["robots"]> {
  // Resolved BEFORE the `&&` so a missing origin cannot be short-circuited past
  // by `allowIndexing === false` — the loud failure must not depend on which
  // input happens to close indexing first.
  const indexableHost = await isIndexableCurrentHost(configuredUrl);
  const index = allowIndexing && indexableHost;
  return { index, follow: index };
}

/**
 * Templated per-entity SEO description fallback (FE-09 / D-04).
 *
 * When provider SEOData (Yoast or Shopify SEO panels) is absent, every entity
 * route still needs a non-empty description from the entity name + store name.
 */
export function seoFallbackDescription(
  entityType: SeoEntityType,
  name: string,
  storeName?: OptSeoStr,
): string {
  const site = resolveStoreName(storeName);
  const trimmed = seoText(name);
  const label = trimmed.length > 0 ? trimmed : site;
  switch (entityType) {
    case "product":
      return `Shop ${label} at ${site}. View details, pricing, and availability.`;
    case "category":
      return `Browse ${label} at ${site}. Discover products in the ${label} collection.`;
    case "page":
      return `${label} — read more on ${site}.`;
  }
}

/**
 * Entity page title segment for the root `%s | {storeName}` template.
 * Returns the bare entity name (or store name when empty) — the layout
 * title template appends `| {storeName}`. Callers with a complete provider
 * SEO title should pass it via {@link makeSeoMetadata}, which uses `absolute`.
 */
export function seoFallbackTitle(
  name?: OptSeoStr,
  storeName?: OptSeoStr,
): string {
  const trimmed = seoText(name);
  if (trimmed.length > 0) return trimmed;
  return resolveStoreName(storeName);
}

/** Build root (homepage / layout) metadata from optional overrides. */
export async function makeRootMetadata(options?: {
  title?: OptSeoStr;
  description?: OptSeoStr;
  siteName?: OptSeoStr;
  /**
   * Per-store branding icon URL (ENG-572). Used for favicon via
   * {@link brandingIcons}; also OG/Twitter fallback when no dedicated OG image.
   */
  iconUrl?: OptSeoStr;
  /** Dashboard SEO OG image (takes precedence over branding icon for shares). */
  ogImageUrl?: OptSeoStr;
  /**
   * Store-level “show on search engines”.
   *
   * Omitting it means "the store's switch is UNKNOWN", which resolves to
   * `noindex, nofollow` — not to index. Every degraded/`catch` branch that
   * builds root metadata without a branding read lands here, and `app/robots.ts`
   * already answers the same failure with `Disallow: /`; a default of true would
   * make the two signals disagree in exactly the branch where the store state
   * is unknowable.
   */
  allowIndexing?: boolean | undefined;
  /**
   * Runtime store domain (`storeSettings.domain`), preferred over the
   * build-time `NEXT_PUBLIC_FRONTEND_URL` for `metadataBase` and the feed URL
   * so they agree with the canonical this page emits. See {@link storefrontUrl}.
   */
  siteUrl?: string | null | undefined;
  /**
   * Self-referencing canonical for the page using this metadata.
   *
   * Pass it ONLY from a concrete page (`app/page.tsx`), never from the root
   * layout: layout `alternates` are inherited by any route whose own metadata
   * omits the key, so a layout-level canonical would point every such route at
   * the homepage.
   */
  canonical?: string | undefined;
}): Promise<Metadata> {
  const siteName = resolveStoreName(options?.siteName);
  const title = seoText(options?.title) || siteName;
  const description = stripTags(options?.description ?? "");
  const shareImage = resolveOgImageUrl({
    dashboardOgImageUrl: options?.ogImageUrl,
    brandingIconUrl: options?.iconUrl,
  });
  const allowIndexing = options?.allowIndexing === true;
  const siteUrl = resolveSiteUrl(options?.siteUrl, SITE_URL);
  const feedUrl = siteUrl ? `${siteUrl}/feed.xml` : "/feed.xml";

  // Single-locale storefront: no hreflang alternates. lang="en" is set on <html>.
  // If/when i18n ships, add alternates.languages here (and self + x-default).

  return {
    title: {
      default: title,
      template: `%s | ${siteName}`,
    },
    description,
    metadataBase: new URL(siteUrl || "http://localhost:3000"),
    applicationName: siteName,
    robots: await resolveRobots(allowIndexing, siteUrl),
    alternates: {
      ...(options?.canonical ? { canonical: options.canonical } : {}),
      types: {
        "application/rss+xml": feedUrl,
      },
    },
    // NOTE: favicon `icons` are intentionally NOT set here — layout-only via
    // brandingIcons so page metadata cannot clobber the per-store tab icon.
    ...(shareImage
      ? {
          openGraph: {
            type: "website",
            title,
            description,
            siteName,
            images: [{ url: shareImage }],
          },
          twitter: {
            card: "summary_large_image",
            title,
            description,
            images: [shareImage],
          },
        }
      : {
          openGraph: {
            type: "website",
            title,
            description,
            siteName,
          },
          twitter: {
            card: "summary",
            title,
            description,
          },
        }),
  };
}

/**
 * Build the site-wide favicon `icons` metadata (ENG-572).
 *
 * Call this ONLY from the root layout's `generateMetadata`.
 */
export function brandingIcons(
  iconUrl?: OptSeoStr,
): NonNullable<Metadata["icons"]> {
  const normalized = normalizeUrl(iconUrl);
  const favicon = normalized ?? "/icon-default.svg";
  return {
    icon: [{ url: favicon }],
    shortcut: favicon,
    ...(normalized ? { apple: normalized } : {}),
  };
}

/** Optional fallbacks for {@link makeSeoMetadata} (EOPT-safe). */
export type MakeSeoMetadataFallback = {
  title?: string | undefined;
  description?: string | undefined;
  /** Explicit canonical URL the caller computed (e.g. PDP per-colorway). */
  canonical?: string | undefined;
  /** Explicit OG image the caller computed (e.g. variant / Yoast image). */
  ogImage?: string | undefined;
  /** Dashboard SEO OG image (after entity, before branding icon). */
  dashboardOgImageUrl?: string | undefined;
  /** Branding icon as last OG fallback. */
  brandingIconUrl?: string | undefined;
  /** Store name for title templates / openGraph.siteName. */
  storeName?: string | undefined;
  /**
   * Runtime store domain (`storeSettings.domain`). Preferred over the
   * build-time `NEXT_PUBLIC_FRONTEND_URL` when deciding whether a CMS canonical
   * is same-host, and for `metadataBase`. See {@link storefrontUrl}.
   */
  siteUrl?: string | null | undefined;
  /**
   * Store-level “show on search engines”.
   *
   * OMITTING this no longer means "index" — the key is then left off the
   * returned metadata entirely so Next inherits the root layout's `robots`,
   * which is always built from the store setting. Passing it explicitly is
   * still preferred; the inherit path exists so a route's degraded/`catch`
   * branch cannot silently publish a page the store has switched off.
   */
  allowIndexing?: boolean | undefined;
};

/** Build page metadata from a SeoData object returned by the SDK. */
export async function makeSeoMetadata(
  seo?: SeoData | null,
  fallback?: MakeSeoMetadataFallback,
): Promise<Metadata> {
  const storeName = resolveStoreName(fallback?.storeName);

  // Real SEO title that already includes the store brand wins as absolute
  // (Yoast is often "{name} - {site}"). Bare page titles (e.g. "Projects")
  // stay as a segment so the root `%s | {storeName}` template appends once.
  // Always decode entities — Yoast frequently emits `&amp;` / `&#8211;`.
  const decodedSeoTitle = seoText(seo?.title);
  const seoTitle = isRealSeoTitle(decodedSeoTitle) ? decodedSeoTitle : null;
  const entityName = seoFallbackTitle(fallback?.title, storeName);
  const displayTitle = seoTitle ?? entityName;
  const titleMeta: Metadata["title"] =
    seoTitle && titleIncludesStoreBrand(seoTitle, storeName)
      ? { absolute: seoTitle }
      : (seoTitle ?? entityName);
  const description = stripTags(
    seo?.metaDesc ?? seo?.opengraphDescription ?? fallback?.description,
  );
  const siteUrl = resolveSiteUrl(fallback?.siteUrl, SITE_URL);
  const canonical = resolveCanonical({
    seoCanonical: seo?.canonical,
    fallbackCanonical: fallback?.canonical,
    siteUrl,
  });

  const entityOg =
    (seo as SeoData & { opengraphImageUrl?: string | null })
      ?.opengraphImageUrl ??
    (seo as SeoData & { twitterImageUrl?: string | null })?.twitterImageUrl ??
    null;

  const ogImage = resolveOgImageUrl({
    entityImageUrl: fallback?.ogImage ?? entityOg,
    dashboardOgImageUrl: fallback?.dashboardOgImageUrl,
    brandingIconUrl: fallback?.brandingIconUrl,
  });

  const openGraphTitle = seoText(seo?.opengraphTitle) || displayTitle;
  const twitterTitle = seoText(seo?.twitterTitle) || displayTitle;

  return {
    title: titleMeta,
    description,
    metadataBase: new URL(siteUrl || "http://localhost:3000"),
    alternates: canonical ? { canonical } : undefined,
    // Key omitted (not `undefined`) when the caller states no preference:
    // Next's metadata merge only walks keys PRESENT on the object, so an
    // absent `robots` inherits the layout's store-driven value, while
    // `robots: undefined` would resolve to null and clobber it.
    ...(fallback?.allowIndexing === undefined
      ? {}
      : { robots: await resolveRobots(fallback.allowIndexing, siteUrl) }),
    openGraph: {
      type: "website",
      title: openGraphTitle,
      description: stripTags(seo?.opengraphDescription ?? description),
      url: canonical,
      siteName: storeName,
      ...(ogImage ? { images: [{ url: ogImage }] } : {}),
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title: twitterTitle,
      description: stripTags(seo?.twitterDescription ?? description),
      ...(ogImage ? { images: [ogImage] } : {}),
    },
  };
}
