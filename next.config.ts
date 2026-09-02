import { readFileSync } from "node:fs";
import { availableParallelism, totalmem } from "node:os";

import type { NextConfig } from "next";

import {
  parseCgroupMemoryLimit,
  resolveBuildWorkers,
} from "./lib/build-parallelism";

/**
 * The container's memory limit, when the kernel exposes one (cgroup v2 first,
 * then v1). Unreadable on macOS and on any host without cgroups, which is why
 * every failure here is `undefined` rather than an error: the caller then falls
 * back to `os.totalmem()`, and a missing limit only ever costs workers, never
 * over-provisions them.
 */
function readCgroupMemoryLimit(): number | undefined {
  for (const path of [
    "/sys/fs/cgroup/memory.max",
    "/sys/fs/cgroup/memory/memory.limit_in_bytes",
  ]) {
    try {
      const parsed = parseCgroupMemoryLimit(readFileSync(path, "utf8"));
      if (parsed !== undefined) return parsed;
    } catch {
      /* No cgroup at this path — try the next, then fall back. */
    }
  }
  return undefined;
}

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
  // Shopify Storefront CDNs. Exact hosts — never a ** wildcard. Shops that
  // serve /cdn/shop/... from the myshopify domain need the subdomain pattern.
  { protocol: "https", hostname: "cdn.shopify.com" },
  { protocol: "https", hostname: "cdn.shopifycdn.net" },
  { protocol: "https", hostname: "*.myshopify.com" },
];

/**
 * `IMAGE_DOMAIN` accepts a COMMA-SEPARATED list, not just one host.
 *
 * A migrating store serves images from more than one origin at once, and this
 * is the normal case rather than an edge one. WordPress stores absolute URLs in
 * post content, so a database copied from the old site keeps pointing at the
 * OLD host — while newly-read media resolves against the new one. Dishee's home
 * carousel referenced `commerce.dishee.com.au` while every product image came
 * from the clone.
 *
 * A host missing from this allowlist does not degrade: the optimizer answers
 * 400 and the image renders broken, with `naturalWidth` 0 and a 200 on the page
 * around it. Nothing reports it. (400 = refused by this allowlist, 404 =
 * allowed through and simply absent upstream — a useful way to tell them apart
 * when diagnosing.)
 *
 * Still an explicit allowlist, never a wildcard host — the optimizer is an SSRF
 * surface, so entries stay exact hostnames.
 */
for (const rawHost of (process.env.IMAGE_DOMAIN ?? "").split(",")) {
  const hostname = rawHost.trim();
  if (hostname) remotePatterns.push({ protocol: "https", hostname });
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
 * exhausting the SDK retry budget.
 *
 * The SDK also caps in-flight reads per process
 * (`HEADKIT_SDK_MAX_CONCURRENT`, default 4, 0 = off) — the precise throttle on
 * what WP actually sees. That cap is per worker PROCESS, so the effective
 * global read ceiling is `HEADKIT_SDK_MAX_CONCURRENT × workers`, and it is the
 * worker count — not the page concurrency — that moves it: a worker rendering
 * two pages at once still has at most 4 reads on the wire.
 *
 * Both were hard-coded to `1` while the SDK had no proactive cap, so every
 * storefront prerendered with ONE worker whatever machine it was given. For a
 * large catalogue the cost is not a slow build but an unfinishable one: on
 * Vercel's standard 4-core/8 GB build machine one worker reached 13,116 of a
 * store's 14,615 pages in the 45-minute platform ceiling
 * (`BUILD_EXCEEDED_MAXIMUM_TIME`).
 *
 * The worker count is now derived from the build MACHINE — see
 * `lib/build-parallelism.ts`, which carries the four-build measurement it comes
 * from. Memory, not cores, is the binding resource, so an 8 GB machine still
 * resolves to one worker (today's behaviour, and the config that did not OOM)
 * while a 16 GB machine gets two.
 *
 * Page concurrency stays at 1. Raising it to 2 was measured to buy no
 * throughput — a worker's page renders are dominated by one upstream read
 * each, and the SDK's cap is per PROCESS, so two pages at once still put at
 * most 4 reads on the wire — while coinciding with the worst failure of the
 * four builds. It is left as an env lever rather than a default.
 *
 * Both stay overridable in BOTH directions: `NEXT_BUILD_CPUS=1` pins the
 * serialized build for a store whose provider cannot take the reads, and a
 * bigger build machine can be spent by raising them.
 */
const positiveIntEnv = (raw: string | undefined, fallback: number): number => {
  const n = Number(raw ?? "");
  return Number.isInteger(n) && n > 0 ? n : fallback;
};
const buildCpus = positiveIntEnv(
  process.env.NEXT_BUILD_CPUS,
  resolveBuildWorkers({
    totalMemBytes: totalmem(),
    cgroupLimitBytes: readCgroupMemoryLimit(),
    cpus: availableParallelism(),
  }),
);
const staticGenConcurrency = positiveIntEnv(
  process.env.NEXT_STATIC_GEN_CONCURRENCY,
  1,
);

/**
 * Deployment identifier, stamped onto every JS/CSS asset request as `?dpl=`.
 *
 * Two things depend on it, and neither is available without it.
 *
 * Version skew: a browser holding the previous build's client bundle keeps
 * requesting the previous build's chunks. With a deployment id, Next detects
 * the mismatch and performs a hard navigation instead of failing the request.
 *
 * Deployment verification: a deployment reporting `state: READY` is not the
 * same claim as "the DOMAIN serves that deployment", and nothing observable
 * from outside separates them unless the served HTML carries the id. Reading
 * it off the page is the only way to assert that a sweep of a live storefront
 * describes ONE deployment rather than a mixture of two mid-rollout — which is
 * what a migration cutover is.
 *
 * `VERCEL_DEPLOYMENT_ID` is injected by Vercel at build. Off Vercel — local
 * dev, Docker, CI — both are unset, this resolves to `undefined`, the key is
 * omitted, and Next behaves exactly as it did before. Vercel's Skew Protection
 * toggle sets the same thing, but per project: doing it here makes it a
 * property of the template every store inherits, rather than a checkbox each
 * new store can be created without.
 */
const deploymentId =
  process.env.NEXT_DEPLOYMENT_ID ?? process.env.VERCEL_DEPLOYMENT_ID;

const nextConfig: NextConfig = {
  transpilePackages: ["@headkit/sdk"],
  ...(deploymentId ? { deploymentId } : {}),
  // Cache Components (already on) + Partial Prefetching unlock Instant
  // Navigations in Next.js 16.3: reusable App Shells, fewer prefetch
  // requests, Instant Insights / Navigation Inspector in dev.
  // https://nextjs.org/blog/next-16-3
  //
  // `partialPrefetching: true` is NOT re-added until the pinned Next is >= 16.3.
  // On the pinned 16.2.x it is not a valid NextConfig key: Next logs
  // "Unrecognized key(s) in object: 'partialPrefetching'" and drops it, so it
  // was already inert at runtime — but it failed `next build`'s type check,
  // which broke `bun run build` (a CI gate) for the whole workspace.
  cacheComponents: true,
  experimental: {
    optimizePackageImports: [
      "react-icons",
      "lucide-react",
      "@headkit/sdk",
      "framer-motion",
      "date-fns",
      "radix-ui",
    ],
    cpus: buildCpus,
    staticGenerationMaxConcurrency: staticGenConcurrency,
    // Report EVERY bad page in one build, not just the first one.
    //
    // Deliberate diagnostic choice — do not "clean up" as an unused
    // experimental flag. Next's default (`true`) makes the export worker
    // `process.exit(1)` on the first page that fails after its retries, so a
    // catalogue with three broken products surfaces exactly one of them per
    // run. With a 14,615-page store that build costs ~32 minutes, so each
    // additional bad row is another half-hour round trip; the most recent one
    // died at page 14,448 and told us nothing about the 167 after it.
    //
    // Set to `false`, the worker records the failure and keeps going; the
    // export then throws `Export encountered errors on N paths:` listing all
    // of them (next/dist/export/index.js). The build still FAILS on a
    // prerender error — this changes only how much of the damage one failing
    // build is allowed to report.
    prerenderEarlyExit: false,
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
  async redirects() {
    return [
      // /posts -> /news, the blog's one url move.
      //
      // headkit-demo served the blog at /posts; apps/starter serves it at
      // /news. This lived as two route files calling `redirect()`, and doing a
      // url move in a rendered page failed three separate ways at once:
      //
      //   `redirect()` emits 307, not 308, so the move was TEMPORARY and
      //   passed no ranking to /news — while both files documented themselves
      //   as "permanent redirect".
      //
      //   Both files awaited `params`/`searchParams` inside Suspense, and a
      //   redirect thrown inside a Suspense boundary runs AFTER the response
      //   has committed. `/posts/<slug>` therefore answered 200 with an app
      //   shell and redirected only on the client — invisible to a crawler,
      //   which is the only reader this exists for. (A rendered page CAN serve
      //   a real 308 under Cache Components, but only above every boundary —
      //   in-page, `loading.tsx` and ancestor-layout alike — and it forfeits
      //   the route's App Shell to do it; `app/collections/[...slug]/page.tsx`
      //   documents the measurements and pays that price because it has a
      //   category to look up first.)
      //
      //   The index built its query string by treating `searchParams` as a
      //   plain object; in Next 16 it is a Promise, so every request landed on
      //   `/news?displayName=searchParams`.
      //
      // A url move has nothing to fetch and nothing to render, so it belongs
      // here — before rendering, unconditionally, as a real 308. Measured on a
      // dev server: /posts, /posts/<slug> and /posts?page=2 all 308 to their
      // /news counterpart with the query intact.
      { source: "/posts", destination: "/news", permanent: true },
      { source: "/posts/:slug*", destination: "/news/:slug*", permanent: true },
      // Shopify Online Store URL shapes → HeadKit/Woo storefront paths.
      // Commerce menus/content now emit bare /{page} and /{postsBase}/…, but
      // bookmarked Admin links and any missed emitter still 404 without these.
      { source: "/pages/:path*", destination: "/:path*", permanent: true },
      {
        source: "/blogs/:blog/:article*",
        destination: "/:blog/:article*",
        permanent: true,
      },
      { source: "/blogs/:blog", destination: "/:blog", permanent: true },
      // Shopify Catalog / "All Collections" and the automatic "All products"
      // collection → HeadKit /shop (Woo shop page). Do NOT redirect
      // /collections/:slug — those are real category PLPs.
      { source: "/collections", destination: "/shop", permanent: true },
      { source: "/collections/all", destination: "/shop", permanent: true },
    ];
  },
  async rewrites() {
    return [];
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
