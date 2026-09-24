import { describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";

vi.hoisted(() => {
  process.env.NEXT_PUBLIC_HEADKIT_PUBLIC_KEY ??= "pk_test";
  process.env.NEXT_PUBLIC_GRAPHQL_URL ??= "http://localhost:4000/graphql";
  process.env.HEADKIT_PRIVATE_KEY ??= "sk_test";
});

vi.mock("server-only", () => ({}));

/**
 * `/shop` advertises a visible Home › Shop breadcrumb but emitted no
 * `BreadcrumbList`. This asserts the two now come from ONE array, by invoking
 * the real page and reading the elements it returns.
 *
 * Limits, stated because a guard that overclaims is worse than none: it proves
 * the page RETURNS the node with the same items the header renders. It cannot
 * see whether the node reaches the served HTML — the page's default export is
 * sync and this route carries no Suspense boundary at all, but only an HTTP
 * read with JavaScript off observes that. It also asserts nothing about the
 * grid or the category carousel, and nothing about the visible
 * `CollectionHeader` crumb, which `ShopHeader` renders asynchronously below.
 */
function findByDisplayName(
  node: ReactNode,
  name: string,
): ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findByDisplayName(child, name);
      if (found) return found;
    }
    return undefined;
  }
  if (!isValidElement(node)) return undefined;
  const element = node as ReactElement<{ children?: ReactNode }>;
  const type = element.type as { name?: string };
  if (typeof type === "function" && type.name === name) {
    return element as ReactElement<Record<string, unknown>>;
  }
  return findByDisplayName(element.props.children, name);
}

describe("/shop emits a BreadcrumbList", () => {
  it("returns Home › Shop, the same crumbs the visible header renders", async () => {
    const { default: Page } = await import("./page");
    // The route takes no props and awaits nothing: it renders the JSON-LD, the
    // cached header and the cached grid straight into the static shell.
    const crumbNode = findByDisplayName(Page(), "BreadcrumbJsonLD");

    expect(
      crumbNode,
      "/shop must render <BreadcrumbJsonLD>; without it there is no BreadcrumbList in the HTML.",
    ).toBeDefined();
    expect(crumbNode?.props.items).toEqual([
      { name: "Home", href: "/" },
      { name: "Shop", href: "/shop" },
    ]);
  });
});
