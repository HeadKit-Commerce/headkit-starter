import type { NextConfig } from "next";

/**
 * Image `remotePatterns` allowlist (FE-10).
 *
 * Built conditionally so an unset/empty `IMAGE_DOMAIN` never produces an
 * empty-string hostname (which crashes the Next 16 build —
 * `images.remotePatterns[n].hostname`). Specific hosts are allowlisted to
 * avoid SSRF via the image optimizer — never a `**` wildcard host.
 *
 * Always allowlisted:
 *  - `storage.googleapis.com` — GCS-served static media for the SDK/commerce
 *    catalog AND dashboard-api branding (logo/icon) assets (FE-08).
 *  - `localhost` — local WP/WC media host for local Docker dev (WP on :8090,
 *    served over http).
 *
 * Conditionally allowlisted:
 *  - `process.env.IMAGE_DOMAIN` — a deploy's configured image host; pushed
 *    ONLY when non-empty.
 */
const remotePatterns: NonNullable<NextConfig["images"]>["remotePatterns"] = [
  { protocol: "https", hostname: "storage.googleapis.com" },
  { protocol: "http", hostname: "localhost" },
  // Local WP media is served on :8090 — an explicit-port URL does not match a
  // portless remotePattern in Next 16, so the optimizer 400s without this entry
  // (gray placeholders for every product/hero/brand image in local dev).
  { protocol: "http", hostname: "localhost", port: "8090" },
];

if (process.env.IMAGE_DOMAIN) {
  remotePatterns.push({
    protocol: "https",
    hostname: process.env.IMAGE_DOMAIN,
  });
}

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "SAMEORIGIN",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
];

const nextConfig: NextConfig = {
  transpilePackages: ["@headkit/sdk"],
  cacheComponents: true,
  experimental: {
    optimizePackageImports: ["react-icons"],
    // Build-time throttle. Prerendering the full category×colour×brand +
    // product×colour matrix fires bursts of reads at the gateway → WooCommerce
    // REST; managed WP (Pressable) rate-limits aggressively and stays 429 for
    // longer than a few seconds, exhausting the SDK retry budget. Serialize the
    // export — one worker, one page at a time — so at most a single page's
    // fan-out (≤2 reads) hits WP at once. Slower build, but green against a
    // rate-limited backend; the SDK retry handles any incidental 429.
    cpus: 1,
    staticGenerationMaxConcurrency: 1,
  },
  images: {
    qualities: [50, 75, 100],
    remotePatterns,
    // Next 16 blocks image URLs that resolve to a private/loopback IP (SSRF
    // protection, default false). Local WP media is on http://localhost:8090,
    // which resolves to 127.0.0.1, so the optimizer 400s ("url is not allowed")
    // in local dev. Allow it ONLY in dev — production keeps the safe default.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== "production",
  },
  async rewrites() {
    return [
      // Apple Pay domain verification. Without this, the dotted `.well-known`
      // path falls through to the /[...slug] catch-all and returns the HTML app
      // shell, so Stripe's verification fetch fails and Apple Pay stays hidden.
      // Map it to a route handler that serves the Stripe-issued token.
      {
        source: "/.well-known/apple-developer-merchantid-domain-association",
        destination: "/api/apple-pay-domain-association",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
