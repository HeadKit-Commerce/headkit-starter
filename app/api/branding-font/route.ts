import {
  brandingFontGcsUrl,
  isSafeBrandingFontFileName,
} from "@/lib/brand-font-url";

/**
 * GET /api/branding-font?f=<file>&v=<optional>
 *
 * Proxies dashboard-uploaded brand fonts from GCS so `@font-face` is
 * same-origin (Chrome blocks cross-origin fonts without CORS).
 */

const CONTENT_TYPE: Record<string, string> = {
  woff2: "font/woff2",
  woff: "font/woff",
  ttf: "font/ttf",
  otf: "font/otf",
};

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const fileName = searchParams.get("f")?.trim() ?? "";
  if (!isSafeBrandingFontFileName(fileName)) {
    return new Response("Not found", { status: 404 });
  }

  const version = searchParams.get("v")?.trim() || undefined;
  const upstream = brandingFontGcsUrl(fileName, version);
  if (!upstream) {
    return new Response("Not found", { status: 404 });
  }

  const upstreamRes = await fetch(upstream, {
    // Fonts change rarely; cache at the edge / CDN. Cache-bust with `v`.
    next: { revalidate: 86_400 },
  });

  if (!upstreamRes.ok) {
    return new Response("Not found", {
      status: upstreamRes.status === 404 ? 404 : 502,
    });
  }

  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  const contentType =
    CONTENT_TYPE[ext] ??
    upstreamRes.headers.get("content-type") ??
    "application/octet-stream";

  const body = await upstreamRes.arrayBuffer();
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": contentType,
      "Cache-Control": version
        ? "public, max-age=31536000, immutable"
        : "public, max-age=86400, stale-while-revalidate=604800",
      // Allow other HeadKit surfaces to load the face if needed.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
