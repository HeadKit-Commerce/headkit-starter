import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PostSummaryFieldsFragment } from "@headkit/sdk";

vi.mock("next/image", () => ({
  default: (): null => null,
}));

vi.mock("@/components/headkit-ui/instant-link", () => ({
  InstantLink: ({
    href,
    children,
  }: {
    href: string;
    children: ReactNode;
  }): ReactElement => <a href={href}>{children}</a>,
}));

import { PostCard } from "./post-card";

function post(
  overrides: Partial<PostSummaryFieldsFragment>,
): PostSummaryFieldsFragment {
  return {
    __typename: "Post",
    id: "1",
    title: "How to fold a towel",
    slug: "how-to-fold",
    excerpt: "",
    date: "2026-01-01",
    uri: "/news/how-to-fold",
    featuredImage: null,
    categories: [],
    videoUrl: null,
    ...overrides,
  };
}

describe("PostCard", () => {
  it("links a written post through to the article", () => {
    const html = renderToStaticMarkup(
      <PostCard
        post={post({
          categories: [
            {
              __typename: "PostCategory",
              id: "n",
              name: "News",
              slug: "news",
              count: 1,
            },
          ],
        })}
      />,
    );
    expect(html).toContain('href="/news/how-to-fold"');
    expect(html).not.toContain("Play How to fold a towel");
  });

  it("opens a video-tagged post in a modal instead of navigating", () => {
    const html = renderToStaticMarkup(
      <PostCard
        post={post({
          categories: [
            {
              __typename: "PostCategory",
              id: "v",
              name: "Video",
              slug: "video",
              count: 1,
            },
          ],
          videoUrl: "https://www.youtube.com/watch?v=abcdefghijk",
        })}
      />,
    );
    expect(html).toContain("Play How to fold a towel");
    expect(html).not.toContain('href="/news/how-to-fold"');
  });

  it("still uses a modal when a video tag has no playable URL", () => {
    const html = renderToStaticMarkup(
      <PostCard
        post={post({
          categories: [
            {
              __typename: "PostCategory",
              id: "v",
              name: "Video",
              slug: "video",
              count: 1,
            },
          ],
          videoUrl: null,
        })}
      />,
    );
    expect(html).toContain("<button");
    expect(html).not.toContain("href=");
  });
});
