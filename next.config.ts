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
];

if (process.env.IMAGE_DOMAIN) {
  remotePatterns.push({
    protocol: "https",
    hostname: process.env.IMAGE_DOMAIN,
  });
}

const nextConfig: NextConfig = {
  transpilePackages: ["@headkit/sdk"],
  cacheComponents: true,
  experimental: {
    optimizePackageImports: ["react-icons"],
  },
  images: {
    qualities: [50, 75, 100],
    remotePatterns,
  },
};

export default nextConfig;
