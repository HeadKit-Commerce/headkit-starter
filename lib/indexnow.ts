import { resolveSiteUrl } from "@/lib/site-url";
import { logger } from "@/lib/logger";

/** IndexNow protocol endpoint (shared Bing / Yandex / Seznam / Naver hub). */
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";

/** Max URLs per IndexNow request (protocol allows 10_000; keep batches modest). */
const MAX_URLS_PER_REQUEST = 100;

export interface IndexNowSubmitInput {
  hostOrigin: string;
  key: string;
  paths: string[];
  requestId?: string;
}

export interface IndexNowSubmitResult {
  submitted: boolean;
  urlCount: number;
  status?: number;
  reason?: string;
}

/**
 * True when this deployment should notify IndexNow (production only).
 * Preview / local storefronts must not claim ownership of the live host.
 */
export function isIndexNowProductionHost(): boolean {
  const vercelEnv = process.env.VERCEL_ENV;
  if (vercelEnv != null) return vercelEnv === "production";
  return process.env.NODE_ENV === "production";
}

/**
 * Map relative revalidate paths to absolute https URLs on the store origin.
 * Drops empty / external / fragment-only values; dedupes.
 */
export function pathsToAbsoluteUrls(
  hostOrigin: string,
  paths: string[],
): string[] {
  const origin = resolveSiteUrl(hostOrigin);
  if (!origin) return [];

  const seen = new Set<string>();
  const urls: string[] = [];

  for (const raw of paths) {
    if (typeof raw !== "string") continue;
    const path = raw.trim();
    if (!path.startsWith("/")) continue;
    if (path.startsWith("//")) continue;

    let absolute: string;
    try {
      absolute = new URL(path, `${origin}/`).toString();
    } catch {
      continue;
    }

    if (!absolute.startsWith(origin)) continue;
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    urls.push(absolute);
    if (urls.length >= MAX_URLS_PER_REQUEST) break;
  }

  return urls;
}

/**
 * POST changed URLs to IndexNow. Best-effort — never throws; callers should
 * run off the revalidate response hot path.
 */
export async function submitIndexNow(
  input: IndexNowSubmitInput,
  fetchImpl: typeof fetch = fetch,
): Promise<IndexNowSubmitResult> {
  const origin = resolveSiteUrl(input.hostOrigin);
  if (!origin) {
    return { submitted: false, urlCount: 0, reason: "invalid_host" };
  }

  const key = input.key.trim();
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(key)) {
    return { submitted: false, urlCount: 0, reason: "invalid_key" };
  }

  const urlList = pathsToAbsoluteUrls(origin, input.paths);
  if (urlList.length === 0) {
    return { submitted: false, urlCount: 0, reason: "no_urls" };
  }

  const host = new URL(origin).host;
  const keyLocation = `${origin}/${key}.txt`;
  const body = JSON.stringify({
    host,
    key,
    keyLocation,
    urlList,
  });

  try {
    const res = await fetchImpl(INDEXNOW_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body,
      // IndexNow is fire-and-forget; avoid hanging revalidate after().
      signal: AbortSignal.timeout(8_000),
    });

    logger.info("indexnow.submit", {
      requestId: input.requestId,
      urlCount: urlList.length,
      status: res.status,
      host,
    });

    // 200 OK, 202 Accepted are success; 422 may mean previously submitted.
    const ok = res.status === 200 || res.status === 202 || res.status === 422;
    if (ok) {
      return {
        submitted: true,
        urlCount: urlList.length,
        status: res.status,
      };
    }
    return {
      submitted: false,
      urlCount: urlList.length,
      status: res.status,
      reason: "upstream_error",
    };
  } catch (error) {
    logger.error("indexnow.submit_error", {
      requestId: input.requestId,
      name: error instanceof Error ? error.name : "unknown",
    });
    return { submitted: false, urlCount: urlList.length, reason: "network" };
  }
}
