import { describe, expect, it } from "vitest";
import { extractJsonLd } from "./jsonld";

describe("JSON-LD reduction", () => {
  it("collects nested nodes, including offers.url and breadcrumb items", () => {
    const nodes = extractJsonLd([
      JSON.stringify({
        "@context": "https://schema.org",
        "@type": "Product",
        "@id": "https://s.invalid/shop/a/b/c#product",
        url: "https://s.invalid/shop/a/b/c",
        offers: {
          "@type": "Offer",
          url: "https://s.invalid/shop/a/b/c",
          price: "1.00",
        },
      }),
    ]);
    expect(nodes.map((n) => n.type)).toEqual(["Product", "Offer"]);
    // The URL a port moves is on the nested Offer as much as on the Product.
    expect(nodes[1]!.url).toBe("https://s.invalid/shop/a/b/c");
  });

  it("resolves an @id given as a nested object", () => {
    const nodes = extractJsonLd([
      JSON.stringify({
        "@type": "ListItem",
        item: {
          "@id": "https://s.invalid/collections/kitchen",
          name: "Kitchen",
        },
      }),
    ]);
    expect(nodes.map((n) => n.type)).toEqual(["ListItem"]);
    expect(nodes[0]!.id).toBeNull();
  });

  it("reports a broken block instead of silently capturing nothing", () => {
    // A port that breaks the JSON is a regression; dropping the block would
    // read as "this page never had structured data".
    expect(extractJsonLd(["{not json"])).toEqual([
      { type: "!unparseable-json-ld", url: null, id: null },
    ]);
  });

  it("walks arrays and @graph containers", () => {
    const nodes = extractJsonLd([
      JSON.stringify({
        "@graph": [{ "@type": "WebSite" }, { "@type": "Organization" }],
      }),
    ]);
    expect(nodes.map((n) => n.type)).toEqual(["WebSite", "Organization"]);
  });
});
