import type { MetadataRoute } from "next";
import { getBranding } from "@/lib/branding";

export default async function robots(): Promise<MetadataRoute.Robots> {
  const { seoSettings } = await getBranding();
  const host = process.env.NEXT_PUBLIC_FRONTEND_URL;

  // Search engines off: Disallow everything. Keep VERCEL_ENV noindex as
  // additional safety on page metadata (preview deployments).
  if (!seoSettings.allowIndexing) {
    return {
      rules: [
        {
          userAgent: "*",
          disallow: "/",
        },
      ],
      host,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: [
          "/",
          "/shop/*",
          "/brand/*",
          "/news/*",
          "/projects/*",
          "/collections/*",
        ],
        disallow: [
          "/account/*",
          "/checkout/*",
          "/api/*",
          "/account",
          "/checkout",
          "/api",
          "/search/*",
          "/search",
          "/*/*?*",
          "/*?*",
          "*/thank-you",
          "*/error",
          "*/canceled",
          "*/forgot-password",
          "*/reset-password",
        ],
      },
      {
        userAgent: "Googlebot",
        allow: ["/shop/*?*", "/collections?page=*", "/shop?page=*"],
        disallow: [
          "/account/*",
          "/checkout/*",
          "/api/*",
          "/account",
          "/checkout",
          "/api",
        ],
      },
    ],
    // Sitemap off = omit Sitemap line entirely (do not advertise a URL).
    ...(seoSettings.enableSitemap ? { sitemap: `${host}/sitemap.xml` } : {}),
    host,
  };
}
