import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The RSS document is this route's public byte contract, so the assertions
 * below read the emitted XML — but they normalise every URL it names into a
 * `URL` and assert on origins, never on the surrounding markup.
 *
 * The property under test: every host the feed names must be the one the root
 * layout advertises the feed at, which since the canonical-origin work is
 * `resolveSiteUrl(storeSettings.domain, NEXT_PUBLIC_FRONTEND_URL)`. A feed
 * whose `<atom:link rel="self">` disclaims its own location is broken on its
 * face, and a `<guid isPermaLink="true">` on a host the storefront no longer
 * serves re-delivers every item as new the moment the baked env is corrected.
 */

const { STALE_ENV } = vi.hoisted(() => {
  const url = "https://stale.headkit.app";
  process.env.NEXT_PUBLIC_FRONTEND_URL = url;
  return { STALE_ENV: url };
});

const postsList = vi.fn();
const getLanding = vi.fn();
const storeDomain = vi.fn<() => string | null>();

vi.mock("next/cache", () => ({
  cacheLife: (): void => {},
  cacheTag: (): void => {},
}));

vi.mock("@/lib/sdk", () => ({
  headkit: {
    posts: {
      list: (): unknown => postsList(),
      getLanding: (): unknown => getLanding(),
    },
  },
}));

vi.mock("@/lib/branding", () => ({
  getBranding: (): Promise<unknown> =>
    Promise.resolve({
      seoSettings: { description: "All the news" },
      storeSettings: { name: "Acme", domain: storeDomain() },
    }),
}));

import { GET } from "./route";

/** Every absolute URL the feed names, as parsed `URL`s. */
async function feedUrls(): Promise<{ self: URL; channel: URL; items: URL[] }> {
  const xml = await (await GET()).text();
  const value = (pattern: RegExp): string => {
    const match = pattern.exec(xml);
    if (!match?.[1]) throw new Error(`feed is missing ${pattern}`);
    return match[1];
  };
  const all = (pattern: RegExp): string[] =>
    [...xml.matchAll(pattern)].map((m) => m[1] ?? "");

  return {
    self: new URL(value(/<atom:link href="([^"]+)"/)),
    channel: new URL(value(/<channel>[\s\S]*?<link>([^<]+)<\/link>/)),
    items: [
      ...all(/<item>[\s\S]*?<link>([^<]+)<\/link>/g),
      ...all(/<guid isPermaLink="true">([^<]+)<\/guid>/g),
    ].map((u) => new URL(u)),
  };
}

beforeEach(() => {
  postsList.mockReset();
  getLanding.mockReset();
  storeDomain.mockReset();
  storeDomain.mockReturnValue(null);
  getLanding.mockResolvedValue({ slug: "news" });
  postsList.mockResolvedValue({
    posts: [
      {
        slug: "first-post",
        uri: "/news/first-post",
        title: "First post",
        excerpt: "",
        date: "2026-01-01T00:00:00Z",
      },
    ],
  });
});

describe("RSS feed origin", () => {
  it("names the runtime store domain, not the baked build-time env", async () => {
    storeDomain.mockReturnValue("customer.com");

    const { self, channel, items } = await feedUrls();

    expect(self.origin, "the feed must not disclaim its own location").toBe(
      "https://customer.com",
    );
    expect(self.pathname).toBe("/feed.xml");
    expect(channel.origin).toBe("https://customer.com");
    expect(items.length).toBeGreaterThan(0);
    expect(
      items.map((u) => u.origin),
      "an item link or permalink guid on a stale host re-delivers every item once the env is corrected",
    ).toEqual(items.map(() => "https://customer.com"));
  });

  it("falls back to the baked env when the store has no custom domain", async () => {
    const { self, channel, items } = await feedUrls();

    for (const url of [self, channel, ...items]) {
      expect(url.origin).toBe(STALE_ENV);
    }
  });
});
