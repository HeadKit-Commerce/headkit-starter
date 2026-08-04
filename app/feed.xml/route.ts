import { cacheLife, cacheTag } from "next/cache";
import { headkit as sdk } from "@/lib/sdk";
import { getBranding } from "@/lib/branding";
import {
  resolveStoreName,
  resolveFooterDescription,
} from "@/lib/make-metadata";

// Cache Components bans `export const dynamic` — caching is via `"use cache"`
// on getFeedPosts + Cache-Control on the Response.
const SITE_URL = (process.env.NEXT_PUBLIC_FRONTEND_URL ?? "").replace(
  /\/$/,
  "",
);

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function postLink(slug: string, uri?: string | null): string {
  if (uri?.startsWith("http")) return uri;
  if (uri?.startsWith("/")) return `${SITE_URL}${uri}`;
  return `${SITE_URL}/news/${slug}`;
}

async function getFeedPosts() {
  "use cache";
  cacheLife("hours");
  cacheTag("headkit:posts");
  return sdk.posts.list({ page: 1, perPage: 20 });
}

/**
 * RSS 2.0 feed for blog/news posts (`/news`).
 * Linked from root metadata via `alternates.types["application/rss+xml"]`.
 */
export async function GET(): Promise<Response> {
  const [{ storeSettings, seoSettings }, postsResult] = await Promise.all([
    getBranding(),
    getFeedPosts().catch(() => ({
      posts: [] as Awaited<ReturnType<typeof getFeedPosts>>["posts"],
    })),
  ]);

  const siteName = resolveStoreName(storeSettings.name);
  const description = resolveFooterDescription(
    seoSettings.description,
    storeSettings.name,
  );
  const channelLink = SITE_URL || "http://localhost:3000";
  const feedSelf = `${channelLink}/feed.xml`;

  const items = postsResult.posts
    .map((post) => {
      const link = postLink(post.slug, post.uri);
      const title = escapeXml(post.title || "Untitled");
      const desc = escapeXml(stripHtml(post.excerpt || ""));
      const pubDate = post.date
        ? new Date(post.date).toUTCString()
        : new Date().toUTCString();
      return `    <item>
      <title>${title}</title>
      <link>${escapeXml(link)}</link>
      <guid isPermaLink="true">${escapeXml(link)}</guid>
      <pubDate>${pubDate}</pubDate>
      <description>${desc}</description>
    </item>`;
    })
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(siteName)} News</title>
    <link>${escapeXml(channelLink)}/news</link>
    <description>${escapeXml(description)}</description>
    <language>en</language>
    <atom:link href="${escapeXml(feedSelf)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`;

  return new Response(xml, {
    headers: {
      "Content-Type": "application/rss+xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
