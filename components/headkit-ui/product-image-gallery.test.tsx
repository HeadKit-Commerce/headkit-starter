import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductImageGallery } from "./product-image-gallery";

vi.mock("next/image", () => ({
  default: (props: { alt?: string; src?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={props.alt ?? ""}
      src={typeof props.src === "string" ? props.src : ""}
    />
  ),
}));

vi.mock("@/components/icon", () => ({
  ChevronLeftIcon: () => <span data-icon="chevron-left" />,
  ChevronRightIcon: () => <span data-icon="chevron-right" />,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => <>{children}</>,
  DialogTrigger: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => (
    <button type="button" className={className}>
      {children}
    </button>
  ),
}));

vi.mock("@/components/ui/lightbox", () => ({
  Lightbox: (): null => null,
}));

vi.mock("@/components/headkit-ui/badge-list", () => ({
  BadgeList: (): null => null,
}));

const IMAGES = [
  { src: "/a.jpg", alt: "Front" },
  { src: "/b.jpg", alt: "Back" },
  { src: "/c.jpg", alt: "Detail" },
];

function markup(layout?: string): string {
  return renderToStaticMarkup(
    layout === undefined ? (
      <ProductImageGallery images={IMAGES} />
    ) : (
      <ProductImageGallery images={IMAGES} layout={layout} />
    ),
  );
}

describe("ProductImageGallery layouts", () => {
  it("defaults to grid masonry and marks the hook", () => {
    const html = markup();
    expect(html).toContain('data-pdp-gallery="grid"');
    expect(html).toContain("md:grid md:grid-cols-2");
    expect(html).toContain("col-span-2");
    expect(html).not.toContain("Previous image");
    expect(html).not.toContain('role="listbox"');
  });

  it("renders hero + thumbnail strip", () => {
    const html = markup("thumbnails");
    expect(html).toContain('data-pdp-gallery="thumbnails"');
    expect(html).toContain('role="listbox"');
    expect(html).toContain("View image 2");
    expect(html).toContain("md:aspect-[var(--pdp-gallery-hero-aspect,3/4)]");
    expect(html).not.toContain("md:grid md:grid-cols-2");
  });

  it("renders carousel arrows and dots", () => {
    const html = markup("carousel");
    expect(html).toContain('data-pdp-gallery="carousel"');
    expect(html).toContain("Previous image");
    expect(html).toContain("Next image");
    expect(html).toContain("Go to image 2");
    expect(html).toContain('data-icon="chevron-left"');
  });

  it("renders a stacked lookbook column", () => {
    const html = markup("stack");
    expect(html).toContain('data-pdp-gallery="stack"');
    expect(html).toContain("flex flex-col gap-5");
    expect(html).not.toContain("Previous image");
    expect(html).not.toContain("md:grid md:grid-cols-2");
  });

  it("coerces an unknown layout to grid", () => {
    const html = markup("masonry");
    expect(html).toContain('data-pdp-gallery="grid"');
  });
});
