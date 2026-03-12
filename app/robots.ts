import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/shop/*", "/brand/*", "/news/*", "/collections/*"],
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
    sitemap: `${process.env.NEXT_PUBLIC_FRONTEND_URL}/sitemap.xml`,
    host: process.env.NEXT_PUBLIC_FRONTEND_URL,
  };
}
