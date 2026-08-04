/**
 * Per-tenant branding / store-settings / SEO fetch (FE-08).
 *
 * Branding lives in **dashboard-api** — the HeadKit graph that is a SEPARATE
 * transport from commerce / the storefront SDK. This module MUST NOT import the
 * commerce SDK or talk to the commerce gateway; it issues a plain GraphQL POST
 * to the dashboard-api endpoint configured via `DASHBOARD_API_URL`.
 *
 * Local-stack note (Open Q2 / phase-3 decision = "degrade"): dashboard-api is
 * not currently part of the local Docker supergraph and has no documented local
 * URL. So `DASHBOARD_API_URL` / `DASHBOARD_API_TOKEN` are UNSET locally and
 * `getBranding()` degrades to the documented defaults below (matching
 * `app/globals.css`: --color-primary #7f54b3 (and --color-purple-500 tracking
 * it for hovers/accents), --color-secondary #000000, no
 * logo/icon override, no gtmId, root SEO left to its existing values). This is
 * structurally wired: the moment both are provisioned, real per-tenant branding
 * flows through with no code change.
 *
 * Production auth: dashboard-api GraphQL (`/graphql/subgraph/headkit`) requires
 * `Authorization: Bearer <store API token>`. The provisioner mints
 * `DASHBOARD_API_TOKEN` on initial deploy and always upserts `DASHBOARD_API_URL`.
 *
 * `DASHBOARD_API_URL` must be the full headkit GraphQL path
 * (`{BASE_URL}/graphql/subgraph/headkit`) — the bare Cloud Run host 404s, and
 * `/graphql/subgraph/` alone is the mount prefix, not the gqlgen handler.
 *
 * Mirrors the `lib/account-actions.ts` server-fetch + try/catch envelope shape,
 * but uses `fetch` directly (no SDK) because branding is off the commerce path.
 *
 * Tenant isolation (T-03-B1): the Bearer token scopes the request to one store;
 * this client never sends a client-supplied tenant id.
 */

import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { TAG } from "@/lib/cache-tags";
import {
  executeRequest,
  HEADKIT_GRAPHQL_URL,
  GetBrandingDocument,
} from "@headkit/sdk";
import { env } from "@/lib/env";

// ---------------------------------------------------------------------------
// Types — mirror the dashboard-api schema (schema.graphqls)
// ---------------------------------------------------------------------------

export interface BrandingFont {
  source: string;
  family: string;
  googleSlug: string;
  fileUrl: string;
}

export interface Branding {
  primaryColor: string;
  secondaryColor: string;
  backgroundColor: string;
  textColor: string;
  logoUrl: string | null;
  iconUrl: string | null;
  headingFont: BrandingFont;
  subheadingFont: BrandingFont;
  bodyFont: BrandingFont;
  cornerStyle: string;
  iconLibrary: string;
}

export interface StoreSettings {
  id: string | null;
  slug: string | null;
  name: string | null;
  gtmId: string | null;
  domain: string | null;
}

export interface SeoSettings {
  title: string | null;
  description: string | null;
  ogImageUrl: string | null;
  /** When false, storefront sitemap returns empty and robots omits Sitemap. */
  enableSitemap: boolean;
  /** When false, storefront emits noindex/nofollow and robots Disallow: /. */
  allowIndexing: boolean;
}

export interface BrandingBundle {
  branding: Branding;
  storeSettings: StoreSettings;
  seoSettings: SeoSettings;
}

// ---------------------------------------------------------------------------
// Documented defaults (degrade target) — keep in lockstep with globals.css
// ---------------------------------------------------------------------------

/** Default brand color tokens — MUST match `app/globals.css` :root values. */
export const DEFAULT_PRIMARY_COLOR = "#7f54b3";
export const DEFAULT_SECONDARY_COLOR = "#000000";
export const DEFAULT_BACKGROUND_COLOR = "#ffffff";
export const DEFAULT_TEXT_COLOR = "#171717";
export const DEFAULT_CORNER_STYLE = "soft";
export const DEFAULT_ICON_LIBRARY = "hi2";

const EMPTY_FONT: BrandingFont = {
  source: "",
  family: "",
  googleSlug: "",
  fileUrl: "",
};

const DEFAULT_BUNDLE: BrandingBundle = {
  branding: {
    primaryColor: DEFAULT_PRIMARY_COLOR,
    secondaryColor: DEFAULT_SECONDARY_COLOR,
    backgroundColor: DEFAULT_BACKGROUND_COLOR,
    textColor: DEFAULT_TEXT_COLOR,
    logoUrl: null,
    iconUrl: null,
    headingFont: EMPTY_FONT,
    subheadingFont: EMPTY_FONT,
    bodyFont: EMPTY_FONT,
    cornerStyle: DEFAULT_CORNER_STYLE,
    iconLibrary: DEFAULT_ICON_LIBRARY,
  },
  storeSettings: {
    id: null,
    slug: null,
    name: null,
    gtmId: null,
    domain: null,
  },
  seoSettings: {
    title: null,
    description: null,
    ogImageUrl: null,
    enableSitemap: true,
    allowIndexing: true,
  },
};

// ---------------------------------------------------------------------------
// Query — branding + storeSettings + seoSettings
// ---------------------------------------------------------------------------

/**
 * Core selection shared by the full + compat queries. Colors, logo, store name,
 * and classic SEO fields MUST stay here — a failed SEO-gate field must never
 * wipe the whole branding payload (that regression discarded colors/logo when
 * dashboard-api lagged behind the starter SEO query).
 *
 * Extended brand fields (background/text/fonts/style/icons) live in the FULL
 * query only; {@link BRANDING_QUERY_COMPAT} keeps legacy dashboard-api working.
 */
const BRANDING_CORE_SELECTION = /* GraphQL */ `
    branding {
      primaryColor
      secondaryColor
      logoUrl
      iconUrl
    }
    storeSettings {
      id
      slug
      name
      gtmId
      domain
    }
    seoSettings {
      title
      description
      ogImageUrl
`;

const BRANDING_EXTENDED_SELECTION = /* GraphQL */ `
    branding {
      primaryColor
      secondaryColor
      backgroundColor
      textColor
      logoUrl
      iconUrl
      headingFontSource
      headingFontFamily
      headingFontGoogleSlug
      headingFontFileUrl
      subheadingFontSource
      subheadingFontFamily
      subheadingFontGoogleSlug
      subheadingFontFileUrl
      bodyFontSource
      bodyFontFamily
      bodyFontGoogleSlug
      bodyFontFileUrl
      cornerStyle
      iconLibrary
    }
    storeSettings {
      id
      slug
      name
      gtmId
      domain
    }
    seoSettings {
      title
      description
      ogImageUrl
`;

/** Full query including sitemap/indexing gates + extended branding fields. */
const BRANDING_QUERY = /* GraphQL */ `
  query StorefrontBranding {
${BRANDING_EXTENDED_SELECTION}
      enableSitemap
      allowIndexing
    }
  }
`;

/**
 * Extended branding without SEO-gate fields. Used when dashboard-api has
 * background/fonts/style/icons but not yet enableSitemap / allowIndexing.
 */
const BRANDING_QUERY_EXTENDED = /* GraphQL */ `
  query StorefrontBrandingExtended {
${BRANDING_EXTENDED_SELECTION}
    }
  }
`;

/**
 * Compat query for older dashboard-api revisions that lack enableSitemap /
 * allowIndexing / extended branding fields. gqlgen returns `data: null` for
 * unknown fields — that used to discard colors/logo/name entirely. We retry
 * without the newer fields and default them in {@link coerce}.
 */
const BRANDING_QUERY_COMPAT = /* GraphQL */ `
  query StorefrontBrandingCompat {
${BRANDING_CORE_SELECTION}
    }
  }
`;

interface FlatBranding extends Partial<Branding> {
  headingFontSource?: string | null;
  headingFontFamily?: string | null;
  headingFontGoogleSlug?: string | null;
  headingFontFileUrl?: string | null;
  subheadingFontSource?: string | null;
  subheadingFontFamily?: string | null;
  subheadingFontGoogleSlug?: string | null;
  subheadingFontFileUrl?: string | null;
  bodyFontSource?: string | null;
  bodyFontFamily?: string | null;
  bodyFontGoogleSlug?: string | null;
  bodyFontFileUrl?: string | null;
}

interface BrandingResponse {
  data?: {
    branding?: FlatBranding | null;
    storeSettings?: Partial<StoreSettings> | null;
    seoSettings?:
      | (Partial<SeoSettings> & {
          enableSitemap?: boolean | null;
          allowIndexing?: boolean | null;
        })
      | null;
  };
  errors?: Array<{ message: string }>;
}

function coerceFont(
  source: string | null | undefined,
  family: string | null | undefined,
  googleSlug: string | null | undefined,
  fileUrl: string | null | undefined,
): BrandingFont {
  return {
    source: source ?? "",
    family: family ?? "",
    googleSlug: googleSlug ?? "",
    fileUrl: fileUrl ?? "",
  };
}

/** Coerce a possibly-partial branding payload into a complete, typed bundle. */
function coerce(data: NonNullable<BrandingResponse["data"]>): BrandingBundle {
  const b = data.branding ?? {};
  const s = data.storeSettings ?? {};
  const seo = data.seoSettings ?? {};
  return {
    branding: {
      primaryColor: b.primaryColor || DEFAULT_PRIMARY_COLOR,
      secondaryColor: b.secondaryColor || DEFAULT_SECONDARY_COLOR,
      backgroundColor: b.backgroundColor || DEFAULT_BACKGROUND_COLOR,
      textColor: b.textColor || DEFAULT_TEXT_COLOR,
      logoUrl: b.logoUrl ?? null,
      iconUrl: b.iconUrl ?? null,
      headingFont: coerceFont(
        b.headingFontSource,
        b.headingFontFamily,
        b.headingFontGoogleSlug,
        b.headingFontFileUrl,
      ),
      subheadingFont: coerceFont(
        b.subheadingFontSource,
        b.subheadingFontFamily,
        b.subheadingFontGoogleSlug,
        b.subheadingFontFileUrl,
      ),
      bodyFont: coerceFont(
        b.bodyFontSource,
        b.bodyFontFamily,
        b.bodyFontGoogleSlug,
        b.bodyFontFileUrl,
      ),
      cornerStyle: b.cornerStyle || DEFAULT_CORNER_STYLE,
      iconLibrary: b.iconLibrary || DEFAULT_ICON_LIBRARY,
    },
    storeSettings: {
      id: s.id ?? null,
      slug: s.slug ?? null,
      name: s.name ?? null,
      gtmId: s.gtmId ?? null,
      domain: s.domain ?? null,
    },
    seoSettings: {
      title: seo.title ?? null,
      description: seo.description ?? null,
      ogImageUrl: seo.ogImageUrl ?? null,
      // Defaults true when dashboard-api has not yet shipped the field.
      enableSitemap: seo.enableSitemap !== false,
      allowIndexing: seo.allowIndexing !== false,
    },
  };
}

/**
 * True when the GraphQL payload has usable branding / store / SEO data.
 * Unknown-field errors often set sibling keys to null but still return the
 * rest of `data` — prefer that over discarding the whole bundle.
 */
function hasUsableBrandingData(
  data: BrandingResponse["data"],
): data is NonNullable<BrandingResponse["data"]> {
  if (!data) return false;
  return (
    data.branding != null ||
    data.storeSettings != null ||
    data.seoSettings != null
  );
}

/** POST one branding query; returns coerced bundle or null on hard failure. */
async function fetchBrandingQuery(
  endpoint: string,
  token: string,
  query: string,
): Promise<BrandingBundle | null> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: brandingRequestHeaders(token),
    body: JSON.stringify({ query }),
    // Caching is governed by the enclosing `'use cache'` + cacheLife
    // on {@link getBranding}, so no fetch-level `next.revalidate` here.
  });

  if (!res.ok) return null;

  const json = (await res.json()) as BrandingResponse;
  if (hasUsableBrandingData(json.data)) {
    return coerce(json.data);
  }
  return null;
}

/**
 * Fetch per-tenant branding / store-settings / SEO from dashboard-api.
 *
 * Degrades gracefully to {@link DEFAULT_BUNDLE} when:
 *  - `DASHBOARD_API_URL` or `DASHBOARD_API_TOKEN` is unset (local default), or
 *  - the request fails / times out / the endpoint is unreachable, or
 *  - both the full and compat queries return no usable data.
 *
 * Resilience: if the full query fails because dashboard-api does not yet
 * expose `enableSitemap` / `allowIndexing`, retries {@link BRANDING_QUERY_COMPAT}
 * so colors, logo, and store name still resolve. Never throws (T-03-B4).
 *
 * Cached (Cache Components, `'use cache'`): branding is a per-tenant-per-DEPLOY
 * read — the tenant resolves from build/deploy env (`DASHBOARD_API_URL` +
 * token), NOT a per-request runtime API (no cookies()/headers()/searchParams),
 * so the read is deterministic and cacheable. Caching it here keeps the ROOT
 * LAYOUT's branding read out of the uncached set, so it no longer poisons every
 * route's static prerender under Cache Components. The stable `'branding'`
 * cacheTag lets `/api/revalidate` invalidate it when dashboard-api branding
 * changes.
 */
export async function getBranding(): Promise<BrandingBundle> {
  "use cache: remote";
  cacheLife("days");
  cacheTag(TAG.branding);

  const endpoint = env.DASHBOARD_API_URL;
  const token = env.DASHBOARD_API_TOKEN;
  // Both required — URL alone gets 401 from APITokenAuthMiddleware.
  if (!endpoint || !token) return DEFAULT_BUNDLE;

  try {
    const full = await fetchBrandingQuery(endpoint, token, BRANDING_QUERY);
    if (full) return full;

    const extended = await fetchBrandingQuery(
      endpoint,
      token,
      BRANDING_QUERY_EXTENDED,
    );
    if (extended) return extended;

    const compat = await fetchBrandingQuery(
      endpoint,
      token,
      BRANDING_QUERY_COMPAT,
    );
    if (compat) return compat;

    return DEFAULT_BUNDLE;
  } catch {
    // Unreachable / timeout / parse error — degrade silently.
    return DEFAULT_BUNDLE;
  }
}

/** Headers for the FE-08 dashboard-api branding GraphQL POST. */
function brandingRequestHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    Authorization: `Bearer ${token}`,
  };
}

// ---------------------------------------------------------------------------
// Commerce-path branding icon (ENG-572)
// ---------------------------------------------------------------------------

/**
 * Fetch the store icon URL from the COMMERCE graph (`commerce.branding.iconUrl`)
 * via the PK/SK SDK transport — the same path `app/api/icon` already uses.
 *
 * Why a second source: the commerce `StoreBranding` exposes `iconUrl` and is
 * available on the LOCAL Docker supergraph (unlike dashboard-api, whose
 * `DASHBOARD_API_URL` is unset locally — see {@link getBranding}). So the
 * per-store icon that Branding settings persist in WordPress (`siteIcon`, or
 * `logo` as fallback) reaches the storefront through this path both locally and
 * in production.
 *
 * Never throws: returns `null` on any error / missing key so callers keep the
 * file-convention favicon and the default `<Logo/>`.
 */
async function fetchCommerceBrandingIcon(): Promise<string | null> {
  const apiKey = env.HEADKIT_PRIVATE_KEY;
  if (!apiKey) return null;
  try {
    const url = env.NEXT_PUBLIC_GRAPHQL_URL ?? HEADKIT_GRAPHQL_URL;
    const data = await executeRequest(
      { url, apiKey },
      GetBrandingDocument,
      undefined,
    );
    return data.commerce.branding.iconUrl ?? null;
  } catch {
    return null;
  }
}

/** Per-store logo + icon URLs resolved for the storefront head + nav. */
export interface BrandingAssets {
  /** Nav/site logo URL, or null → render the default `<Logo/>`. */
  logoUrl: string | null;
  /** Favicon / OG-share icon URL, or null → keep the file-convention default. */
  iconUrl: string | null;
}

/**
 * Resolve the per-store logo + icon for head metadata and the nav (ENG-572).
 *
 * Merges the two branding transports so each asset comes from wherever it is
 * actually available:
 *  - `iconUrl` (favicon/OG): commerce `iconUrl` first (locally available), then
 *    the dashboard-api `iconUrl` — so the favicon is testable on the local stack.
 *  - `logoUrl` (nav logo): the dashboard-api `logoUrl` (the only real logo field)
 *    first, falling back to the commerce `iconUrl` so a store that only set an
 *    icon still gets a branded mark instead of the HeadKit default.
 *
 * Both branches degrade to `null` (never throw), leaving the built-in defaults.
 *
 * Cached (Cache Components): a per-tenant-per-deploy read (tenant resolves from
 * the SDK key / dashboard-api env, not a per-request runtime API), so it is
 * deterministic and cacheable. Carries `TAG.branding` (`headkit:branding`) — the
 * SAME tag {@link getBranding} uses and the storefront contract WP fires on a
 * logo/site-icon change — so a `/api/revalidate` branding purge invalidates both.
 * (Previously the bare literal `"branding"`, which is neither exact- nor
 * prefix-known, so it silently dropped at the revalidate route.)
 */
export async function getBrandingAssets(): Promise<BrandingAssets> {
  "use cache: remote";
  cacheLife("hours");
  cacheTag(TAG.branding);

  const [bundle, commerceIcon] = await Promise.all([
    getBranding(),
    fetchCommerceBrandingIcon(),
  ]);

  return {
    iconUrl: commerceIcon ?? bundle.branding.iconUrl,
    logoUrl: bundle.branding.logoUrl ?? commerceIcon,
  };
}
