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

/**
 * Build-time prerender throttle (layered with the SDK's in-flight read cap).
 *
 * Prerendering the full category×colour×brand + product×colour matrix fires
 * bursts of reads at the gateway → WooCommerce REST; managed WP (Pressable)
 * rate-limits aggressively and stays 429 for longer than a few seconds,
 * exhausting the SDK retry budget. Defaults stay fully serialized (1/1) —
 * today's safe behavior.
 *
 * The SDK now also caps in-flight reads per process
 * (`HEADKIT_SDK_MAX_CONCURRENT`, default 4, 0 = off) — the precise throttle on
 * what WP actually sees. With that ceiling in place, builds can be sped up by
 * raising these env vars; note the SDK cap is per worker process, so the
 * effective global read ceiling is `HEADKIT_SDK_MAX_CONCURRENT × NEXT_BUILD_CPUS`.
 */
const positiveIntEnv = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw ?? "");
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
const buildCpus = positiveIntEnv(process.env.NEXT_BUILD_CPUS, 1);
const staticGenConcurrency = positiveIntEnv(
  process.env.NEXT_STATIC_GEN_CONCURRENCY,
  1,
);

const nextConfig: NextConfig = {
  transpilePackages: ["@headkit/sdk"],
  // Cache Components (already on) + Partial Prefetching unlock Instant
  // Navigations in Next.js 16.3: reusable App Shells, fewer prefetch
  // requests, Instant Insights / Navigation Inspector in dev.
  // https://nextjs.org/blog/next-16-3
  cacheComponents: true,
  partialPrefetching: true,
  experimental: {
    optimizePackageImports: ["react-icons"],
    cpus: buildCpus,
    staticGenerationMaxConcurrency: staticGenConcurrency,
  },
  images: {
    // Prefer modern formats everywhere the optimizer runs (PLP cards, heroes,
    // logos). AVIF first, WebP fallback — never serve source PNG/JPEG bytes
    // when the optimizer can negotiate a smaller format.
    formats: ["image/avif", "image/webp"],
    // 65 = PLP/carousel default (FeaturedImage); 50 = cart thumbs; 75 = heroes.
    qualities: [50, 65, 75, 100],
    remotePatterns,
    // Next 16 blocks image URLs that resolve to a private/loopback IP (SSRF
    // protection, default false). Local WP media is on http://localhost:8090,
    // which resolves to 127.0.0.1, so the optimizer 400s ("url is not allowed")
    // in local dev. Allow it ONLY in dev — production keeps the safe default.
    // ALLOW_LOCAL_IMAGES=1 is a measurement-only escape hatch so a local
    // PRODUCTION build (Lighthouse against `next start`) can serve WP media;
    // it must never be set on a real deploy and defaults off.
    dangerouslyAllowLocalIP:
      process.env.NODE_ENV !== "production" ||
      process.env.ALLOW_LOCAL_IMAGES === "1",
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
