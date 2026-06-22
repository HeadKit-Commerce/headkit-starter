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
 * URL. So `DASHBOARD_API_URL` is UNSET locally and `getBranding()` degrades to
 * the documented defaults below (matching `app/globals.css`: --color-primary
 * #7f54b3, --color-secondary #000000, no logo/icon override, no gtmId, root SEO
 * left to its existing values). This is structurally wired: the moment a local
 * dashboard-api transport is provisioned and `DASHBOARD_API_URL` is set, real
 * per-tenant branding flows through with no code change.
 *
 * Mirrors the `lib/account-actions.ts` server-fetch + try/catch envelope shape,
 * but uses `fetch` directly (no SDK) because branding is off the commerce path.
 *
 * Tenant isolation (T-03-B1): the dashboard-api endpoint resolves the CURRENT
 * tenant server-side (via its own auth/host scoping); this client never sends a
 * client-supplied tenant id, so it cannot read another tenant's branding.
 */

import "server-only";
import {
  unstable_cacheLife as cacheLife,
  unstable_cacheTag as cacheTag,
} from "next/cache";

// ---------------------------------------------------------------------------
// Types — mirror the dashboard-api schema (schema.graphqls)
// ---------------------------------------------------------------------------

export interface Branding {
  primaryColor: string;
  secondaryColor: string;
  logoUrl: string | null;
  iconUrl: string | null;
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

const DEFAULT_BUNDLE: BrandingBundle = {
  branding: {
    primaryColor: DEFAULT_PRIMARY_COLOR,
    secondaryColor: DEFAULT_SECONDARY_COLOR,
    logoUrl: null,
    iconUrl: null,
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
  },
};

// ---------------------------------------------------------------------------
// Query — single round-trip for branding + storeSettings + seoSettings
// ---------------------------------------------------------------------------

const BRANDING_QUERY = /* GraphQL */ `
  query StorefrontBranding {
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
    }
  }
`;

interface BrandingResponse {
  data?: {
    branding?: Partial<Branding> | null;
    storeSettings?: Partial<StoreSettings> | null;
    seoSettings?: Partial<SeoSettings> | null;
  };
  errors?: Array<{ message: string }>;
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
      logoUrl: b.logoUrl ?? null,
      iconUrl: b.iconUrl ?? null,
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
    },
  };
}

/**
 * Fetch per-tenant branding / store-settings / SEO from dashboard-api.
 *
 * Degrades gracefully to {@link DEFAULT_BUNDLE} when:
 *  - `DASHBOARD_API_URL` is unset (the LOCAL default — see file header), or
 *  - the request fails / times out / the endpoint is unreachable, or
 *  - the response carries GraphQL errors or no data.
 *
 * Never throws: callers (e.g. the root layout) can rely on always receiving a
 * complete bundle, so the storefront never crashes if dashboard-api is down
 * (threat T-03-B4).
 *
 * Cached (Cache Components, `'use cache'`): branding is a per-tenant-per-DEPLOY
 * read — the tenant resolves from build/deploy env (`DASHBOARD_API_URL`), NOT a
 * per-request runtime API (no cookies()/headers()/searchParams), so the read is
 * deterministic and cacheable. Caching it here keeps the ROOT LAYOUT's branding
 * read out of the uncached set, so it no longer poisons every route's static
 * prerender under Cache Components. The stable `'branding'` cacheTag lets a
 * future `/api/revalidate` invalidate it when dashboard-api branding changes.
 */
export async function getBranding(): Promise<BrandingBundle> {
  "use cache";
  cacheLife("hours");
  cacheTag("branding");

  const endpoint = process.env.DASHBOARD_API_URL;
  // No local dashboard-api transport configured → documented defaults.
  if (!endpoint) return DEFAULT_BUNDLE;

  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ query: BRANDING_QUERY }),
      // Caching is governed by the enclosing `'use cache'` + cacheLife("hours")
      // above (Cache Components), so no fetch-level `next.revalidate` here.
    });

    if (!res.ok) return DEFAULT_BUNDLE;

    const json = (await res.json()) as BrandingResponse;
    if (json.errors?.length || !json.data) return DEFAULT_BUNDLE;

    return coerce(json.data);
  } catch {
    // Unreachable / timeout / parse error — degrade silently.
    return DEFAULT_BUNDLE;
  }
}
