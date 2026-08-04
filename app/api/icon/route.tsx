import { ImageResponse } from "next/og";
import { Logo } from "@/components/icon/logo";
import type { NextRequest } from "next/server";
import { createServerHeadkit } from "@/lib/sdk.server";
import {
  executeRequest,
  HEADKIT_GRAPHQL_URL,
  GetBrandingDocument,
} from "@headkit/sdk";
import { env } from "@/lib/env";

/**
 * GET /api/icon?size=192|512
 *
 * Dynamic PWA icon generation. Returns a 192×192 or 512×512 image.
 * Uses the store branding iconUrl when configured; falls back to the HeadKit logo.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const sizeParam = searchParams.get("size");
  const size = sizeParam === "512" ? 512 : 192;

  // Attempt to fetch branding icon URL; fall back silently on error.
  let iconUrl: string | null = null;
  try {
    const apiKey = env.HEADKIT_PRIVATE_KEY;
    if (apiKey) {
      const url = env.NEXT_PUBLIC_GRAPHQL_URL ?? HEADKIT_GRAPHQL_URL;
      const data = await executeRequest(
        { url, apiKey },
        GetBrandingDocument,
        undefined,
      );
      iconUrl = data.commerce.branding.iconUrl ?? null;
    }
  } catch {
    // Fall through to Logo fallback
  }

  if (iconUrl) {
    // Render the remote icon URL as an <img> to let ImageResponse encode it
    return new ImageResponse(
      // eslint-disable-next-line @next/next/no-img-element
      <img src={iconUrl} width={size} height={size} alt="icon" />,
      { width: size, height: size },
    );
  }

  return new ImageResponse(<Logo width={size} height={size} />, {
    width: size,
    height: size,
  });
}
