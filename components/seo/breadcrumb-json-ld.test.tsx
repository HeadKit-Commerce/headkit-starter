import { describe, expect, it, vi } from "vitest";
import { buildBreadcrumbFromCategory } from "@/components/headkit-ui/collection/utils";
import { BreadcrumbJsonLD } from "./breadcrumb-json-ld";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/branding", () => ({
  getBranding: async () => ({
    storeSettings: { name: "Acme", domain: "acme.example" },
    seoSettings: { allowIndexing: true },
  }),
}));

/**
 * `BreadcrumbList` JSON-LD for a collection page, fed the same crumbs
 * `CollectionHeader` now renders visually — the shape (`@type`, `position`,
 * `name`, `item`) must stay consistent between the two.
 */

type ScriptElement = { props: { dangerouslySetInnerHTML: { __html: string } } };

async function graphOf(
  element: Promise<unknown>,
): Promise<Record<string, unknown>> {
  const rendered = (await element) as ScriptElement;
  return JSON.parse(rendered.props.dangerouslySetInnerHTML.__html) as Record<
    string,
    unknown
  >;
}

describe("BreadcrumbJsonLD for a collection page", () => {
  it("emits a BreadcrumbList with one ordered ListItem per crumb, for a root category", async () => {
    const category = {
      id: "1",
      name: "Helmets",
      slug: "helmets",
      description: "",
      thumbnail: "",
      uri: "",
      children: [],
      ancestors: [],
    };
    const crumbs = buildBreadcrumbFromCategory(category);

    const graph = await graphOf(
      BreadcrumbJsonLD({
        items: crumbs.map((c) => ({ name: c.name, href: c.uri })),
      }),
    );

    expect(graph["@type"]).toBe("BreadcrumbList");
    const items = graph.itemListElement as {
      "@type": string;
      position: number;
      name: string;
      item?: string;
    }[];
    expect(items).toHaveLength(3);
    expect(items.map((i) => i.position)).toEqual([1, 2, 3]);
    expect(items.every((i) => i["@type"] === "ListItem")).toBe(true);
    expect(items.map((i) => i.name)).toEqual(["Home", "Shop", "Helmets"]);
    expect(items.map((i) => i.item)).toEqual([
      "https://acme.example/",
      "https://acme.example/shop",
      "https://acme.example/collections/helmets",
    ]);
  });

  it("emits every ancestor for a nested (three-level) category, root-first", async () => {
    const category = {
      id: "3",
      name: "Outdoor Benches",
      slug: "outdoor-benches",
      description: "",
      thumbnail: "",
      uri: "",
      children: [],
      ancestors: [
        {
          id: "1",
          name: "Outdoor Furniture",
          slug: "outdoor-furniture",
          description: "",
          thumbnail: "",
          uri: "",
          children: [],
          ancestors: [],
        },
        {
          id: "2",
          name: "Outdoor Seating",
          slug: "outdoor-seating",
          description: "",
          thumbnail: "",
          uri: "",
          children: [],
          ancestors: [],
        },
      ],
    };
    const crumbs = buildBreadcrumbFromCategory(category);

    const graph = await graphOf(
      BreadcrumbJsonLD({
        items: crumbs.map((c) => ({ name: c.name, href: c.uri })),
      }),
    );

    const items = graph.itemListElement as { name: string; item?: string }[];
    expect(items.map((i) => i.name)).toEqual([
      "Home",
      "Shop",
      "Outdoor Furniture",
      "Outdoor Seating",
      "Outdoor Benches",
    ]);
    expect(items.map((i) => i.item)).toEqual([
      "https://acme.example/",
      "https://acme.example/shop",
      "https://acme.example/collections/outdoor-furniture",
      "https://acme.example/collections/outdoor-furniture/outdoor-seating",
      "https://acme.example/collections/outdoor-furniture/outdoor-seating/outdoor-benches",
    ]);
  });
});
