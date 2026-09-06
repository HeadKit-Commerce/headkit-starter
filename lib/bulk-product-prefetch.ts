import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type { BulkProductPage, BulkProductStatus } from "@headkit/sdk";
import type { ProductFieldsFragment } from "@headkit/sdk";

/**
 * Build-time bulk prefetch of FULL products, feeding `getCachedProduct`.
 *
 * WHY. A storefront build renders a PDP per product, and every PDP read is one
 * `products/slug/{slug}` request that pays ~0.80 s of WordPress bootstrap
 * before the product is formatted. On a 2,677-product catalogue that is
 * ~27 minutes of origin time spent on bootstrap alone, and the build died at
 * Vercel's 45-minute ceiling (`260904-bikesociety-origin-request-budget`
 * §4.3). The list route pays the bootstrap once per PAGE, so with commerce's
 * gated bulk read (`bulkProducts`, full shape, 20-25 per page) the same
 * catalogue is ~110 requests.
 *
 * WHAT. Once per build, the first worker to need a product asks commerce
 * whether bulk mode is on for the store (`bulkStatus`). When it is, that
 * worker walks the pages and writes one JSON file per product into a
 * per-build directory; every other worker waits for the manifest and then
 * reads the same files. `getCachedProduct` consults the store BEFORE its
 * per-slug read, so a prefetched product substitutes one for one and a
 * product the walk missed (a failed page, a slug added mid-build) still falls
 * through to the single read it always had. Runtime and revalidation never
 * see any of this: the module is inert outside `next build`.
 *
 * WHERE. `<distDir>/headkit-bulk-products/` — under `.next` but NOT under
 * `.next/cache`. `next build` clears `distDir` at start, keeping only
 * `cache|dev|lock|trace`, and Vercel persists only `.next/cache` between
 * builds. So the directory is fresh on every build by construction, shared by
 * every worker of THIS build (they are forks of one `next build` with one
 * cwd), and never inherited by the next one. Putting it under `cache` would
 * have needed a build id to key it by, and a stale store is a stale
 * catalogue served as current.
 *
 * WHEN NOT. Bulk mode off (`enabled: false`) writes a manifest saying so and
 * every lookup misses: the per-slug reads are then exactly today's, and the
 * one status query is the only request this file added. `HEADKIT_BULK_PREFETCH=0`
 * skips even that.
 */

/** Product-file keys are slugs; the theme's slug route accepts `[a-zA-Z0-9_-]+`. */
const SLUG_FILE_RE = /^[a-zA-Z0-9_-]+$/;

/** Subdirectory of `distDir` the per-build store lives in. */
export const BULK_PREFETCH_DIRNAME = "headkit-bulk-products";

/** How many bulk pages one filler keeps in flight. Each page is ~5 s of origin
 *  PHP, so 3 in flight is ~0.6 req/s — well under the origin's 2 req/s — and
 *  the SDK's own in-flight cap (default 4) still bounds it. */
export const BULK_PREFETCH_DEFAULT_CONCURRENCY = 3;

/** Manifest the filler writes when it is done; its presence is the signal. */
export interface BulkPrefetchManifest {
  readonly enabled: boolean;
  readonly reason: string;
  readonly total: number;
  readonly pageSize: number;
  readonly pages: number;
  readonly failedPages: readonly number[];
  readonly count: number;
  readonly startedAt: number;
  readonly finishedAt: number;
}

/** The SDK surface the prefetch uses — injectable so tests need no network. */
export interface BulkPrefetchSdk {
  bulkStatus(): Promise<BulkProductStatus>;
  bulkPage(page: number, perPage: number): Promise<BulkProductPage>;
}

export interface BulkPrefetchOptions {
  /** Per-build store directory. */
  readonly dir: string;
  readonly sdk: BulkPrefetchSdk;
  /** Whether this process is a `next build` prerender; false makes everything inert. */
  readonly isBuild: boolean;
  /** `HEADKIT_BULK_PREFETCH=0` — skip even the status query. */
  readonly disabled?: boolean | undefined;
  readonly concurrency?: number | undefined;
  /** Poll interval while another worker fills the store. */
  readonly pollMs?: number | undefined;
  /** Give up waiting for another worker after this long; lookups then miss. */
  readonly maxWaitMs?: number | undefined;
  /** A lock older than this with no manifest is a dead filler; take over. */
  readonly staleLockMs?: number | undefined;
  readonly now?: (() => number) | undefined;
  readonly log?: ((message: string) => void) | undefined;
}

/** Resolved outcome of `ensure()` for this process. */
export interface BulkPrefetchState {
  readonly enabled: boolean;
  readonly manifest: BulkPrefetchManifest | null;
}

const INERT: BulkPrefetchState = { enabled: false, manifest: null };

function manifestPath(dir: string): string {
  return path.join(dir, "manifest.json");
}

function lockPath(dir: string): string {
  return path.join(dir, ".lock");
}

function productPath(dir: string, slug: string): string {
  return path.join(dir, "products", `${slug}.json`);
}

async function readManifest(dir: string): Promise<BulkPrefetchManifest | null> {
  try {
    const raw = await readFile(manifestPath(dir), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as { enabled?: unknown }).enabled === "boolean"
    ) {
      return parsed as BulkPrefetchManifest;
    }
    return null;
  } catch {
    return null;
  }
}

async function writeJsonAtomic(file: string, value: unknown): Promise<void> {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(value), "utf8");
  await rename(tmp, file);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Walk every bulk page, writing each product as it arrives. A page that
 * throws is recorded and skipped — its products fall through to per-slug
 * reads — and the walk continues, so one bad page never costs the rest.
 */
async function fillStore(
  opts: BulkPrefetchOptions,
  status: BulkProductStatus,
  startedAt: number,
): Promise<BulkPrefetchManifest> {
  const pageSize = Math.max(1, Math.min(status.pageSize, status.maxPerPage));
  const pages = Math.max(1, Math.ceil(status.total / pageSize));
  const concurrency = Math.max(
    1,
    opts.concurrency ?? BULK_PREFETCH_DEFAULT_CONCURRENCY,
  );
  const failedPages: number[] = [];
  let count = 0;
  let next = 1;

  await mkdir(path.join(opts.dir, "products"), { recursive: true });

  const worker = async (): Promise<void> => {
    for (;;) {
      const page = next++;
      if (page > pages) return;
      try {
        const result = await opts.sdk.bulkPage(page, pageSize);
        if (!result.enabled) {
          // The gate closed mid-walk (a re-probe after the TTL). Nothing to
          // write; later pages will say the same. Not a failure.
          return;
        }
        for (const product of result.products) {
          if (!SLUG_FILE_RE.test(product.slug)) continue;
          await writeJsonAtomic(productPath(opts.dir, product.slug), product);
          count++;
        }
      } catch (error) {
        failedPages.push(page);
        opts.log?.(
          `[bulk-prefetch] page ${page}/${pages} failed; its products fall back to per-slug reads: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  };

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  failedPages.sort((a, b) => a - b);

  return {
    enabled: true,
    reason: status.reason,
    total: status.total,
    pageSize,
    pages,
    failedPages,
    count,
    startedAt,
    finishedAt: (opts.now ?? Date.now)(),
  };
}

/**
 * Make sure the per-build store is filled (by this process or another) and
 * report whether it is usable. Never throws: any failure resolves to a
 * disabled state, which is the per-slug path every caller already has.
 */
export async function ensureBulkPrefetch(
  opts: BulkPrefetchOptions,
): Promise<BulkPrefetchState> {
  if (!opts.isBuild || opts.disabled) return INERT;
  const now = opts.now ?? Date.now;
  const pollMs = opts.pollMs ?? 1000;
  const maxWaitMs = opts.maxWaitMs ?? 20 * 60 * 1000;
  const staleLockMs = opts.staleLockMs ?? 30 * 60 * 1000;
  const waitStart = now();

  try {
    await mkdir(opts.dir, { recursive: true });
  } catch {
    return INERT;
  }

  for (;;) {
    const manifest = await readManifest(opts.dir);
    if (manifest) return { enabled: manifest.enabled, manifest };

    // `mkdir` without `recursive` is atomic: exactly one process wins.
    let acquired = false;
    try {
      await mkdir(lockPath(opts.dir));
      acquired = true;
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      if (code !== "EEXIST") return INERT;
    }

    if (acquired) {
      const startedAt = now();
      let manifestOut: BulkPrefetchManifest;
      try {
        const status = await opts.sdk.bulkStatus();
        if (!status.enabled) {
          manifestOut = {
            enabled: false,
            reason: status.reason,
            total: status.total,
            pageSize: status.pageSize,
            pages: 0,
            failedPages: [],
            count: 0,
            startedAt,
            finishedAt: now(),
          };
          opts.log?.(
            `[bulk-prefetch] off for this store (${status.reason}, total ${status.total}, threshold ${status.threshold}); per-slug reads unchanged`,
          );
        } else {
          opts.log?.(
            `[bulk-prefetch] on: ${status.total} products, ${status.pageSize} per page`,
          );
          manifestOut = await fillStore(opts, status, startedAt);
          opts.log?.(
            `[bulk-prefetch] done: ${manifestOut.count} products from ${manifestOut.pages} pages in ${
              manifestOut.finishedAt - startedAt
            } ms${manifestOut.failedPages.length ? `, failed pages ${manifestOut.failedPages.join(",")}` : ""}`,
          );
        }
      } catch (error) {
        // The status query itself failed: say so and leave everyone on the
        // per-slug path. The manifest still gets written so waiters stop.
        manifestOut = {
          enabled: false,
          reason: `status_failed: ${error instanceof Error ? error.message : String(error)}`,
          total: 0,
          pageSize: 0,
          pages: 0,
          failedPages: [],
          count: 0,
          startedAt,
          finishedAt: now(),
        };
        opts.log?.(
          `[bulk-prefetch] status query failed; per-slug reads unchanged: ${manifestOut.reason}`,
        );
      }
      try {
        await writeJsonAtomic(manifestPath(opts.dir), manifestOut);
      } catch {
        return INERT;
      }
      return { enabled: manifestOut.enabled, manifest: manifestOut };
    }

    // Another process holds the lock. Wait for its manifest, unless the lock
    // has gone stale (its owner died) — then take over.
    try {
      const lockStat = await stat(lockPath(opts.dir));
      if (now() - lockStat.mtimeMs > staleLockMs) {
        opts.log?.("[bulk-prefetch] stale lock with no manifest; taking over");
        await rm(lockPath(opts.dir), { recursive: true, force: true });
        continue;
      }
    } catch {
      // Lock vanished between our mkdir and stat: loop and try again.
      continue;
    }
    if (now() - waitStart > maxWaitMs) {
      opts.log?.(
        "[bulk-prefetch] gave up waiting for another worker's fill; per-slug reads for this worker",
      );
      return INERT;
    }
    await sleep(pollMs);
  }
}

/** Read one prefetched product, or null when the store has no file for it. */
export async function readBulkPrefetchedProduct(
  dir: string,
  slug: string,
): Promise<ProductFieldsFragment | null> {
  if (!SLUG_FILE_RE.test(slug)) return null;
  try {
    const raw = await readFile(productPath(dir, slug), "utf8");
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && "slug" in parsed) {
      return parsed as ProductFieldsFragment;
    }
    return null;
  } catch {
    return null;
  }
}

/** Slugs the store holds — for diagnostics and tests. */
export async function listBulkPrefetchedSlugs(dir: string): Promise<string[]> {
  try {
    const names = await readdir(path.join(dir, "products"));
    return names
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.slice(0, -".json".length))
      .sort();
  } catch {
    return [];
  }
}

/**
 * A per-process handle: one `ensure()` per process (memoised), then cheap
 * lookups. `product-cache.ts` owns the default instance; tests build their own.
 */
export function createBulkPrefetch(opts: BulkPrefetchOptions): {
  ensure(): Promise<BulkPrefetchState>;
  get(slug: string): Promise<ProductFieldsFragment | null>;
} {
  let pending: Promise<BulkPrefetchState> | null = null;
  const ensure = (): Promise<BulkPrefetchState> => {
    pending ??= ensureBulkPrefetch(opts).catch(() => INERT);
    return pending;
  };
  return {
    ensure,
    async get(slug: string): Promise<ProductFieldsFragment | null> {
      const state = await ensure();
      if (!state.enabled) return null;
      return readBulkPrefetchedProduct(opts.dir, slug);
    },
  };
}
