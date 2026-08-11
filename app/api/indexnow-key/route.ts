import { connection } from "next/server";
import { getBranding } from "@/lib/branding";

/**
 * GET /api/indexnow-key?key=… — internal handler rewritten from `/{key}.txt`
 * by `proxy.ts`. Returns the key as plain text when IndexNow is enabled and
 * the requested key matches the store's configured key; otherwise 404.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();

  const url = new URL(request.url);
  const requested = url.searchParams.get("key")?.trim() ?? "";
  if (!/^[a-zA-Z0-9-]{8,128}$/.test(requested)) {
    return new Response("Not Found", { status: 404 });
  }

  const { seoSettings } = await getBranding();
  if (
    !seoSettings.indexNowEnabled ||
    !seoSettings.indexNowKey ||
    seoSettings.indexNowKey !== requested
  ) {
    return new Response("Not Found", { status: 404 });
  }

  return new Response(seoSettings.indexNowKey, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
