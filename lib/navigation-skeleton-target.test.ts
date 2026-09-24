import { describe, expect, it } from "vitest";
import {
  isProductDetailPath,
  navigationSkeletonForHref,
} from "@/lib/navigation-skeleton-target";
import { productPath, collectionPathFromSegments } from "@/lib/canonical-path";

/**
 * WHAT THIS COVERS: that one function answers "which skeleton does this href want"
 * for every route family the storefront links to, that it recognises the shapes the
 * app's OWN url builders emit (driven through `productPath` and
 * `collectionPathFromSegments` rather than hand-written strings), and that the
 * routes which must get nothing still get nothing.
 *
 * WHERE IT STOPS, and none of these gaps is small.
 *  - It cannot tell a `/shop/{category}` archive from a `/shop/{product}` —
 *    nothing client-side can, because the difference is in the category tree — so a
 *    case below PINS the known false positive rather than pretending it away.
 *  - It says nothing about POSTS. `"post"` is never derived from a URL (the blog
 *    base is per-store server data), so the only thing assertable here is that the
 *    article-ish shapes fall through to `"page"`. That the post cards actually
 *    thread `skeleton="post"` is a wiring claim, made in
 *    `components/headkit-ui/skeletons/navigation-skeleton.test.tsx`.
 *  - It proves nothing about the delay, the markup, the switch, or the direct-load
 *    path.
 */
describe("navigationSkeletonForHref", () => {
  it("recognises every shape productPath itself produces", () => {
    const nested = {
      slug: "alpine-jacket",
      uri: "/shop/clothing/jackets/alpine-jacket",
    };
    const flat = { slug: "alpine-jacket", uri: null };

    // Driven through productPath rather than through hand-written strings, so a
    // change to the canonical URL shape fails HERE instead of silently turning the
    // skeleton off for every product.
    for (const href of [
      productPath(nested),
      productPath(nested, "matt-black"),
      productPath(flat),
      productPath(flat, "matt-black"),
    ]) {
      expect(navigationSkeletonForHref(href)).toBe("product");
      expect(isProductDetailPath(href)).toBe(true);
    }
  });

  it("recognises the collection paths collectionPathFromSegments produces", () => {
    expect(
      navigationSkeletonForHref(collectionPathFromSegments(["jackets"])),
    ).toBe("collection");
    expect(
      navigationSkeletonForHref(
        collectionPathFromSegments(["clothing", "jackets"]),
      ),
    ).toBe("collection");
  });

  it.each([
    ["an indexable facet", "/collections/jackets/f/colour.black"],
    ["a brand PLP", "/brand/acme"],
    ["the sale landing", "/sale"],
    ["the new-arrivals landing", "/new"],
    ["the featured landing", "/featured"],
    ["the catalogue index", "/shop"],
  ])("gives the collection skeleton to %s", (_label, href) => {
    expect(navigationSkeletonForHref(href)).toBe("collection");
  });

  it.each([
    ["a CMS page", "/wholesale"],
    ["the FAQ", "/faq"],
    ["a nested CMS page", "/legal/privacy-policy"],
    ["a project", "/projects/harbour-fitout"],
    // Not a mistake and not fixable here: the blog base is server data, so an
    // article link that did not come from a post card reads as a page. Wrong in
    // proportion, not in kind.
    ["a post article, absent the threaded prop", "/journal/autumn-sale"],
  ])("gives the page skeleton to %s", (_label, href) => {
    expect(navigationSkeletonForHref(href)).toBe("page");
  });

  it.each([
    ["the home page", "/"],
    ["checkout", "/checkout"],
    ["the quote cart", "/quote"],
    ["an account page", "/account"],
    ["search", "/search"],
    ["the internal blog route a store's own slug redirects out", "/news/sale"],
    ["the dashboard's draft-product preview", "/draft-product/abc"],
    ["an off-origin url", "https://example.com/shop/a/b"],
    ["a tel: link", "tel:1300883919"],
    ["a mailto: link", "mailto:hello@example.com"],
    ["a bare fragment", "#main"],
    ["an asset route", "/sitemap.xml"],
  ])("raises no skeleton at all for %s", (_label, href) => {
    expect(navigationSkeletonForHref(href)).toBeNull();
  });

  it.each([
    ["the collections index", "/collections"],
    ["the brand index", "/brand"],
    ["the flat product base with no slug", "/products"],
  ])("does not read the index %s as its own detail page", (_label, href) => {
    expect(isProductDetailPath(href)).toBe(false);
    expect(navigationSkeletonForHref(href)).not.toBe("collection");
  });

  it("reads the catalogue index as a listing, not as a product", () => {
    // `/shop` is a grid of root category tiles. `shopSegmentsFromPath` reports it
    // as no segments, so the product row declines it and the listing row takes it —
    // which is why the product predicate stays false here.
    expect(isProductDetailPath("/shop")).toBe(false);
    expect(navigationSkeletonForHref("/shop")).toBe("collection");
  });

  it("ignores a query string and a fragment", () => {
    expect(
      navigationSkeletonForHref("/shop/jackets/alpine-jacket?utm=x#reviews"),
    ).toBe("product");
    expect(navigationSkeletonForHref("/collections/jackets?page=2")).toBe(
      "collection",
    );
    expect(navigationSkeletonForHref("/shop?page=2")).not.toBe("product");
  });

  it("KNOWN FALSE POSITIVE: a /shop category archive is indistinguishable", () => {
    // Pinned, not fixed. Separating the two needs the category tree, which is a
    // server read; the cost of the wrong guess is a moment of the wrong skeleton,
    // and no storefront surface emits this shape. If that ever changes, the fix is
    // the threaded `skeleton` prop on InstantLink, not a second URL rule.
    expect(navigationSkeletonForHref("/shop/bikes")).toBe("product");
  });
});
