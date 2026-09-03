import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { HeroCarouselItem } from "@headkit/sdk";
import type { ReactNode } from "react";

/**
 * Shopify / CMS hero titles use the same `{Towel}` markers as product names.
 * The heading must run them through TitleEmphasis — braces are display-only.
 */

vi.mock("next/image", () => ({
  getImageProps: ({
    src,
    alt,
  }: {
    src: string;
    alt: string;
  }): {
    props: { srcSet: string; sizes: string; src: string; alt: string };
  } => ({
    props: { srcSet: src, sizes: "100vw", src, alt },
  }),
}));

vi.mock("@/components/headkit-ui/instant-link", () => ({
  InstantLink: ({
    href,
    children,
  }: {
    href: string;
    children?: ReactNode;
  }): React.JSX.Element => <a href={href}>{children}</a>,
}));

vi.mock("@/components/headkit-ui/carousel", () => ({
  Carousel: <T,>({
    items,
    renderItem,
  }: {
    items: T[];
    renderItem: (item: T, index: number) => ReactNode;
  }): React.JSX.Element => (
    <div data-testid="carousel">
      {items.map((item, index) => (
        <div key={index}>{renderItem(item, index)}</div>
      ))}
    </div>
  ),
}));

import { MainCarousel } from "@/components/headkit-ui/main-carousel";

const slide = (header: string): HeroCarouselItem => ({
  id: "slide-1",
  header,
  description: "Soft on one side.",
  url: "/shop",
  buttonText: "Shop now",
  image: "https://cdn.example.com/hero.jpg",
  mobileImage: null,
});

describe("MainCarousel title emphasis", () => {
  it("italicises {Towel} in the hero heading and drops the braces", () => {
    const html = renderToStaticMarkup(
      <MainCarousel carouselItems={[slide("A new era of {Towel}")]} />,
    );

    expect(html).toContain("A new era of ");
    expect(html).toContain('class="headkit-title-emphasis"');
    expect(html).toContain("Towel");
    expect(html).not.toContain("{Towel}");
    expect(html).not.toContain("A new era of {Towel}");
    expect(html).toContain('alt="A new era of Towel"');
  });
});
