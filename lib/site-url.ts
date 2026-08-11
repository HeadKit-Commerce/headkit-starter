/**
 * Canonical storefront origin used by sitemap, robots, and metadata.
 *
 * `NEXT_PUBLIC_FRONTEND_URL` is inlined at build time. When a custom domain is
 * attached, dashboard-api updates Mongo `Store.domain` immediately but historically
 * updated the Vercel env without redeploying — so the baked public env can lag
 * behind the live host (e.g. still `*.headkit.app` while the shop serves on the
 * customer's apex). Prefer the runtime store domain from branding when present.
 */

/** Absolute http(s) origin with no trailing slash, or empty when unusable. */
export function normalizeSiteUrl(
  domainOrUrl: string | null | undefined,
): string {
  const raw = (domainOrUrl ?? "").trim();
  if (raw.length === 0) return "";

  let parsed: URL;
  try {
    parsed = new URL(
      raw.startsWith("http://") || raw.startsWith("https://")
        ? raw
        : `https://${raw}`,
    );
  } catch {
    return "";
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
  if (!parsed.hostname) return "";

  return `${parsed.protocol}//${parsed.host}`.replace(/\/$/, "");
}

/**
 * Resolve the canonical site origin.
 *
 * @param storeDomain Mongo/dashboard store domain (host or absolute URL)
 * @param frontendEnvUrl build-time `NEXT_PUBLIC_FRONTEND_URL` fallback
 */
export function resolveSiteUrl(
  storeDomain: string | null | undefined,
  frontendEnvUrl: string | null | undefined = process.env
    .NEXT_PUBLIC_FRONTEND_URL,
): string {
  return (
    normalizeSiteUrl(storeDomain) || normalizeSiteUrl(frontendEnvUrl) || ""
  );
}
