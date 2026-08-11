import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { getBranding } from "@/lib/branding";
import { env } from "@/lib/env";
import { isIndexableHost } from "@/lib/host-indexing";
import { resolveSiteUrl } from "@/lib/site-url";

/**
 * Disallow-everything response. Built fresh each call so no caller can mutate a
 * shared object into a permissive one. The `host` line is retained because it
 * is a canonical-host HINT, not a permission — and dropping it would change the
 * output of every store that already has indexing switched off.
 */
function disallowEverything(host: string | undefined): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        disallow: "/",
      },
    ],
    ...(host ? { host } : {}),
  };
}

/**
 * robots.txt, decided by HOSTNAME first (MIG-03, T-15.1-08-01).
 *
 * Order matters. The host predicate is consulted BEFORE — and independently of
 * — the branding read, because every failure mode of that read currently opens
 * indexing: `getBranding()` returns DEFAULT_BUNDLE (both SEO gates enabled)
 * when the dashboard env is unset AND from a bare catch on any thrown read. A
 * temporary migration host must serve `Disallow: /` and advertise no sitemap
 * whatever branding says, so the decision cannot depend on branding at all.
 *
 * Deliberately NOT keyed on the Vercel deployment-environment variable: it
 * reads "production" for a production deployment served at ANY host, including
 * the rehearsal host this route exists to close. That variable is therefore
 * never read here — see lib/host-indexing.ts, which names it in full.
 *
 * Deployment Protection is explicitly NOT the mechanism (T-15.1-08-02). It
 * would 401 Stripe's unauthenticated fetch of
 * /.well-known/apple-developer-merchantid-domain-association, so the payment
 * method domain never activates and Apple Pay renders an empty button — while
 * the operator's own curl, carrying a bypass cookie, returns 200 and the check
 * goes green. /robots.txt and /.well-known/* must stay reachable unauthenticated.
 *
 * Reading the Host header makes this route dynamic; it therefore carries no
 * cache directive by design.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const requestHeaders = await headers();
  const currentHost =
    requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");

  let storeDomain: string | null | undefined;
  let seoSettings: Awaited<ReturnType<typeof getBranding>>["seoSettings"];
  try {
    ({ storeSettings: { domain: storeDomain }, seoSettings } =
      await getBranding());
  } catch {
    // A thrown branding read CLOSES indexing. Prefer the env fallback only for
    // the Host hint so operators still see which origin was configured.
    const fallbackHost = resolveSiteUrl(null, env.NEXT_PUBLIC_FRONTEND_URL);
    return disallowEverything(fallbackHost || undefined);
  }

  // Prefer runtime store domain over baked NEXT_PUBLIC_FRONTEND_URL so custom
  // domains stay authoritative for Host / Sitemap even before a redeploy.
  const host = resolveSiteUrl(storeDomain, env.NEXT_PUBLIC_FRONTEND_URL);

  // Fail closed: an unknown or non-production host is a temporary host.
  if (!isIndexableHost(host, currentHost)) {
    return disallowEverything(host || undefined);
  }

  // Search engines off: Disallow everything.
  if (!seoSettings.allowIndexing) {
    return disallowEverything(host || undefined);
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/shop/*",
          "/brand/*",
          "/news/*",
          "/projects/*",
          "/collections/*",
        ],
        disallow: [
          "/account/*",
          "/checkout/*",
          "/api/*",
          "/account",
          "/checkout",
          "/api",
          "/search/*",
          "/search",
          "/*/*?*",
          "/*?*",
          "*/thank-you",
          "*/error",
          "*/canceled",
          "*/forgot-password",
          "*/reset-password",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: ["/shop/*?*", "/collections?page=*", "/shop?page=*"],
        disallow: [
          "/account/*",
          "/checkout/*",
          "/api/*",
          "/account",
          "/checkout",
          "/api",
        ],
      },
    ],
    // Sitemap off = omit Sitemap line entirely (do not advertise a URL).
    ...(seoSettings.enableSitemap && host
      ? { sitemap: `${host}/sitemap.xml` }
      : {}),
    ...(host ? { host } : {}),
  };
}
