import { connection } from "next/server";

import { getBranding } from "@/lib/branding";
import { resolveBrandFonts } from "@/lib/brand-fonts";

/**
 * GET /api/brand-fonts — this store's `@font-face` rules as a standalone
 * stylesheet.
 *
 * WHY A URL AND NOT THE INLINE RULES WE ALREADY HAVE. Stripe Elements render
 * inside an iframe on `js.stripe.com`. A `@font-face` declared on the parent
 * page does not cross that origin boundary, so passing Stripe a `fontFamily`
 * of `"Nunito, …"` — which `buildCheckoutAppearance()` has always done — names
 * a face the iframe cannot resolve, and every Stripe field silently falls
 * through to the system stack while the site's own fields beside it render in
 * the brand face. The ONLY supported way in is `elements()`'s `fonts` option,
 * which takes either a stylesheet URL (`CssFontSource`) or per-weight
 * descriptors (`CustomFontSource`). This route is that URL.
 *
 * WHY `cssSrc` AND NOT `CustomFontSource`. A `CustomFontSource` names one
 * family at one weight, so the client would have to know the store's face, its
 * selected weights and their file URLs — all of which are resolved server-side
 * from dashboard branding — and would have to re-derive the Fontsource CDN URL
 * shape and the uploaded-font proxy path that `lib/brand-fonts.ts` already
 * owns. This route emits {@link ResolvedBrandFonts.fontFaceCss} verbatim: the
 * SAME string `app/layout.tsx` inlines into the page. Whatever the store's
 * brand font is — a curated Google family at any weight set, or an uploaded
 * file — Stripe gets exactly what the page got, with no second implementation
 * to drift.
 *
 * FONT FILES REACH THE IFRAME. Fonts are always CORS-checked, even when the
 * stylesheet that references them is not. Both sources already answer with
 * `Access-Control-Allow-Origin: *` — jsDelivr for curated faces, and
 * `app/api/branding-font/route.ts` for uploads (which proxies GCS same-origin
 * for the page, and sets the header for exactly this class of consumer).
 *
 * Public by construction: `@font-face` rules naming public font URLs, no store
 * data of any kind.
 */
export async function GET(): Promise<Response> {
  // MUST stay request-time. This handler reads no request API of its own, so
  // without this Next prerenders it at build — and a statically prerendered
  // route on this path loses to the root `[...slug]` catch-all page, whose
  // 404 shell is what actually gets served (observed: correct CSS in
  // `.next/server/app/api/brand-fonts.body`, `"status": 404` in the `.meta`
  // beside it, and a 404 HTML shell on the wire). `await connection()` rather
  // than `export const dynamic`, which Cache Components rejects at build —
  // same pattern as other request-time API routes that must not be prerendered.
  //
  // It costs nothing per request: `getBranding()` is `"use cache: remote"`
  // with a `days` life and the `branding` tag, so this is a cache read, and it
  // makes the served CSS track the same invalidation the page's own inline
  // `@font-face` does instead of a build-time snapshot.
  await connection();

  const { branding } = await getBranding();

  const fonts = resolveBrandFonts({
    heading: branding.headingFont,
    subheading: branding.subheadingFont,
    body: branding.bodyFont,
  });

  return new Response(fonts.fontFaceCss, {
    status: 200,
    headers: {
      "Content-Type": "text/css; charset=utf-8",
      // Same cadence as the branding read this derives from: a store's font
      // choice changes when a merchant edits branding, and `/api/revalidate`
      // purges the `branding` tag that `getBranding()` carries.
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      // Stripe fetches this from `js.stripe.com`. A `<link>` would not need
      // the header, but Stripe is free to fetch it as a resource instead, and
      // the body carries nothing that is not already public.
      "Access-Control-Allow-Origin": "*",
    },
  });
}
