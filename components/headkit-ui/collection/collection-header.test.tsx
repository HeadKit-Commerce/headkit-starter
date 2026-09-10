import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * `CollectionHeader` renders the trail `buildBreadcrumbFromCategory` builds
 * (`collection/utils.ts`) above the `<h1>`, for both a root category, a
 * nested (three-level) category, and the no-breadcrumbs case (a caller that
 * omits the prop must render exactly as before — no empty `<nav>`).
 */

vi.mock("@/components/headkit-ui/instant-link", () => ({
  InstantLink: ({
    href,
    children,
  }: {
    href: string;
    children?: unknown;
  }): React.JSX.Element => <a href={href}>{children as React.ReactNode}</a>,
}));

vi.mock("next/image", () => ({
  default: (props: { alt?: string; src?: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={props.alt ?? ""}
      src={typeof props.src === "string" ? props.src : ""}
      className={props.className}
    />
  ),
}));

import { CollectionHeader } from "@/components/headkit-ui/collection/collection-header";

type Crumb = { name: string; uri: string; current: boolean };

const ROOT_CRUMBS: Crumb[] = [
  { name: "Home", uri: "/", current: false },
  { name: "Shop", uri: "/shop", current: false },
  { name: "Helmets", uri: "/collections/helmets", current: true },
];

const NESTED_CRUMBS: Crumb[] = [
  { name: "Home", uri: "/", current: false },
  { name: "Shop", uri: "/shop", current: false },
  {
    name: "Outdoor Furniture",
    uri: "/collections/outdoor-furniture",
    current: false,
  },
  {
    name: "Outdoor Seating",
    uri: "/collections/outdoor-furniture/outdoor-seating",
    current: false,
  },
  {
    name: "Outdoor Benches",
    uri: "/collections/outdoor-furniture/outdoor-seating/outdoor-benches",
    current: true,
  },
];

/** Text of every crumb `<li>`, in order, with the `>` separators stripped. */
function crumbLabels(html: string): string[] {
  const items = html.match(/<li[^>]*>([\s\S]*?)<\/li>/g) ?? [];
  return items
    .map((li) => li.replace(/<[^>]*>/g, "").trim())
    .filter((text) => text !== ">" && text !== "&gt;" && text.length > 0);
}

describe("CollectionHeader breadcrumb", () => {
  it("renders the trail above the h1 for a root category", () => {
    const html = renderToStaticMarkup(
      <CollectionHeader
        name="Helmets"
        childBasePath="/collections"
        breadcrumbs={ROOT_CRUMBS}
      />,
    );
    expect(crumbLabels(html)).toEqual(["Home", "Shop", "Helmets"]);
    expect(html.indexOf('aria-label="Breadcrumb"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="Breadcrumb"')).toBeLessThan(
      html.indexOf("<h1"),
    );
    expect(html).toContain('href="/shop"');
    // The current crumb is not a link.
    expect(html).not.toContain('href="/collections/helmets"');
  });

  it("renders every ancestor for a nested (three-level) category", () => {
    const html = renderToStaticMarkup(
      <CollectionHeader
        name="Outdoor Benches"
        childBasePath="/collections/outdoor-furniture/outdoor-seating/outdoor-benches"
        breadcrumbs={NESTED_CRUMBS}
      />,
    );
    expect(crumbLabels(html)).toEqual([
      "Home",
      "Shop",
      "Outdoor Furniture",
      "Outdoor Seating",
      "Outdoor Benches",
    ]);
    expect(html).toContain('href="/collections/outdoor-furniture"');
    expect(html).toContain(
      'href="/collections/outdoor-furniture/outdoor-seating"',
    );
  });

  it("renders no breadcrumb nav when the prop is omitted", () => {
    const html = renderToStaticMarkup(
      <CollectionHeader name="Helmets" childBasePath="/collections" />,
    );
    expect(html).not.toContain('aria-label="Breadcrumb"');
  });

  it("renders no breadcrumb nav when the prop is an empty array", () => {
    const html = renderToStaticMarkup(
      <CollectionHeader
        name="Helmets"
        childBasePath="/collections"
        breadcrumbs={[]}
      />,
    );
    expect(html).not.toContain('aria-label="Breadcrumb"');
  });

  it("keeps the trail above the h1 on the leaf-featured (thumbnail) layout", () => {
    const html = renderToStaticMarkup(
      <CollectionHeader
        name="Helmets"
        childBasePath="/collections"
        breadcrumbs={ROOT_CRUMBS}
        thumbnail="https://cdn.example/helmets.jpg"
      />,
    );
    expect(html.indexOf('aria-label="Breadcrumb"')).toBeLessThan(
      html.indexOf("<h1"),
    );
  });
});
