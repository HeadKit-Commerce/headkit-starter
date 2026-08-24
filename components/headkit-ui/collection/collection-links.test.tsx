import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProductCategoryDetail } from "@headkit/sdk";

/**
 * Collection tiles must link a category's CANONICAL path.
 *
 * Every tile surface used to build `/collections/{slug}` from the slug alone,
 * which is correct only for a root category. For a nested one it named the flat
 * shape — the shape `app/collections/[...slug]` now 308s away from — so the
 * storefront's own link graph voted against the URL its sitemap advertises.
 * Neither payload carries ancestry, so each surface gets it from the one place
 * that has it: the parent hands it down, or the category tree is consulted.
 */

vi.mock("server-only", () => ({}));

vi.mock("@/components/headkit-ui/featured-image", () => ({
  FeaturedImage: (): null => null,
}));
vi.mock("@/components/headkit-ui/instant-link", () => ({
  InstantLink: ({
    href,
    children,
  }: {
    href: string;
    children?: unknown;
  }): React.JSX.Element => <a href={href}>{children as React.ReactNode}</a>,
}));
vi.mock("@/components/headkit-ui/carousel", () => ({
  Carousel: <T,>({
    items,
    renderItem,
  }: {
    items: T[];
    renderItem: (item: T, index: number) => React.ReactNode;
  }): React.JSX.Element => (
    <div>
      {items.map((item, index) => (
        <div key={index}>{renderItem(item, index)}</div>
      ))}
    </div>
  ),
}));

import { SubcategoryCard } from "./subcategory-card";
import { CategoryCarousel } from "@/components/headkit-ui/category-carousel";

function category(slug: string): ProductCategoryDetail {
  return {
    id: slug,
    name: slug,
    slug,
    description: "",
    thumbnail: "",
    uri: "",
    seo: null,
    children: [],
    ancestors: [],
  } as unknown as ProductCategoryDetail;
}

/** Every `href` a render emitted, in order. */
function hrefs(markup: string): string[] {
  return [...markup.matchAll(/href="([^"]*)"/g)].map((match) => match[1]!);
}

describe("SubcategoryCard", () => {
  it("nests the child beneath the parent's canonical path", () => {
    const markup = renderToStaticMarkup(
      <SubcategoryCard
        subcategory={category("hoodies")}
        parentPath="/collections/clothing"
      />,
    );

    expect(
      hrefs(markup),
      "a child category card knows only its slug, so the parent must hand down the ancestry — `/collections/hoodies` is the shape the route redirects",
    ).toEqual(["/collections/clothing/hoodies"]);
  });
});

describe("CategoryCarousel", () => {
  it("links the canonical path its server caller resolved, not the slug", () => {
    const markup = renderToStaticMarkup(
      <CategoryCarousel
        categories={[
          {
            name: "Hoodies",
            slug: "hoodies",
            // What `collectionPathResolver` produced for this slug.
            uri: "/collections/clothing/hoodies",
            thumbnail: "",
          },
        ]}
      />,
    );

    expect(
      hrefs(markup),
      "preferring the slug over the resolved path is what put every homepage category tile on the flat shape",
    ).toEqual(["/collections/clothing/hoodies"]);
  });

  it("falls back to the flat path when no caller resolved one", () => {
    const markup = renderToStaticMarkup(
      <CategoryCarousel
        categories={[{ name: "Sale", slug: "sale", uri: "", thumbnail: "" }]}
      />,
    );

    expect(
      hrefs(markup),
      "a served path that then 308s beats a tile that links nowhere",
    ).toEqual(["/collections/sale"]);
  });

  /**
   * `FeaturedCategory.uri` from the SDK is the ABSOLUTE WordPress permalink, so
   * the field's natural value navigates off the Next.js app entirely. Both live
   * callers overwrite it with a resolved storefront path, but this is a shared
   * starter template that customer repos flatten and merge — a dropped `.map`
   * must degrade to an in-app path, never to an off-app one.
   */
  it.each([
    [
      "an absolute WordPress permalink",
      "https://wp.example.com/product-category/sale/",
    ],
    ["a protocol-relative reference", "//evil.example.com/sale"],
  ])("ignores %s and stays in-app", (_label, uri) => {
    const markup = renderToStaticMarkup(
      <CategoryCarousel
        categories={[{ name: "Sale", slug: "sale", uri, thumbnail: "" }]}
      />,
    );

    expect(
      hrefs(markup),
      "preferring the resolved path must not become trusting the raw WP permalink — that navigates the shopper off the storefront",
    ).toEqual(["/collections/sale"]);
  });
});
