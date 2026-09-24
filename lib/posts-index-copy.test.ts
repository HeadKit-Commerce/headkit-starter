import { describe, expect, it } from "vitest";
import { postsIndexHeading } from "@/lib/posts-index-copy";

const FALLBACK = "Stay up to date with our latest news and articles.";

describe("postsIndexHeading", () => {
  it("uses the Shopify or Woo page title and HTML body when the page has text", () => {
    const heading = postsIndexHeading(
      {
        title: "Journal",
        content: "<p>Notes from the studio.</p>",
        seo: { title: "Journal", metaDesc: "Studio notes." },
      },
      { title: "Theme title", description: "Theme intro." },
    );
    expect(heading.title).toBe("Journal");
    expect(heading.content).toBe("<p>Notes from the studio.</p>");
    expect(heading.description).toBe("Studio notes.");
  });

  it("uses customer copy when the landing is only the blog name", () => {
    const heading = postsIndexHeading(
      { title: "News", content: "", seo: null },
      { title: "Journal" },
    );
    expect(heading.title).toBe("Journal");
    expect(heading.content).toBeUndefined();
    expect(heading.description).toBe(FALLBACK);
  });

  it("keeps the blog title when no page body and no customer copy are set", () => {
    const heading = postsIndexHeading(
      { title: "Field notes", content: "   " },
      undefined,
    );
    expect(heading.title).toBe("Field notes");
    expect(heading.description).toBe(FALLBACK);
  });

  it("falls back to News when nothing is set", () => {
    const heading = postsIndexHeading(null, undefined);
    expect(heading.title).toBe("News");
    expect(heading.description).toBe(FALLBACK);
  });
});
