import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductBrandLink } from "./product-brand-link";

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

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

describe("ProductBrandLink", () => {
  it("renders NOTHING without a brand — the multi-tenant default", () => {
    expect(renderToStaticMarkup(<ProductBrandLink />)).toBe("");
    expect(renderToStaticMarkup(<ProductBrandLink brand={null} />)).toBe("");
    expect(
      renderToStaticMarkup(
        <ProductBrandLink brand={{ name: "", slug: "", logoUrl: null }} />,
      ),
    ).toBe("");
  });

  it("renders the logo linking to the brand PLP when a logo exists", () => {
    const html = renderToStaticMarkup(
      <ProductBrandLink
        brand={{
          name: "S-Works",
          slug: "s-works",
          logoUrl: "https://cms.example/S-Works.svg",
        }}
      />,
    );
    expect(html).toContain('href="/brand/s-works"');
    expect(html).toContain('src="https://cms.example/S-Works.svg"');
    expect(html).toContain('alt="S-Works"');
    expect(html).toContain("headkit-product-brand");
    expect(html).toContain('data-testid="product-brand-link"');
  });

  it("falls back to the decoded name when the brand has no logo", () => {
    const html = renderToStaticMarkup(
      <ProductBrandLink
        brand={{ name: "Bont &amp; Co", slug: "bont-co", logoUrl: null }}
      />,
    );
    expect(html).toContain('href="/brand/bont-co"');
    expect(html).not.toContain("<img");
    expect(html).toContain("Bont &amp; Co");
    expect(html).toContain('aria-label="View all Bont &amp; Co products"');
  });
});
