// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactElement, ReactNode } from "react";
import type { HeroCarouselItem } from "@headkit/sdk";

/**
 * An inactive cross-fade slide must be inert, and the active one must not be.
 *
 * The stacked slide containers carry `aria-hidden="true"` and
 * `pointer-events-none` while they are faded out, but `pointer-events-none`
 * does nothing for the keyboard: every link and button inside a hidden slide
 * stayed in the tab order, which is the contradiction Lighthouse reports as
 * `aria-hidden-focus`. The fix is `inert` on the same container, kept in sync
 * with the active index by the same expression `aria-hidden` already uses.
 *
 * These tests drive the real `MainCarousel` → `Carousel` chain in a DOM and
 * assert BOTH directions — a fix that inerted every slide would pass the audit
 * and break the carousel — before and after a slide change made through the
 * carousel's own pagination button.
 *
 * What this does NOT cover: whether a browser actually refuses focus to an
 * inert subtree. jsdom parses the attribute but implements no focus model for
 * it, so the keyboard proof is a browser tab-through and the audit itself is
 * Lighthouse's. It also says nothing about the opacity cross-fade, which has
 * no measurable form here.
 */

// React 19 needs this before `act` will flush updates synchronously.
(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

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
  }): ReactElement => <a href={href}>{children}</a>,
}));

import { MainCarousel } from "@/components/headkit-ui/main-carousel";

// Image-less slides keep the render to the text column and its one link, which
// is the focusable descendant the audit is about.
const SLIDES = [0, 1, 2, 3].map(
  (i) =>
    ({
      id: `slide-${i}`,
      title: `Slide ${i}`,
      header: `Header ${i}`,
      description: `Description ${i}`,
      buttonText: `Shop ${i}`,
      url: `/collections/slide-${i}`,
      image: "",
      mobileImage: "",
      textColor: "",
    }) as unknown as HeroCarouselItem,
);

function slideEl(container: HTMLElement, index: number): HTMLElement {
  const el = container.querySelector<HTMLElement>(`#carousel-item-${index}`);
  if (!el) throw new Error(`no #carousel-item-${index} rendered`);
  return el;
}

function renderCarousel(): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(<MainCarousel carouselItems={SLIDES} />);
  });
  return { container, root };
}

describe("hero carousel slides leave the focus order when they are hidden", () => {
  it("inerts every slide but the active one, and each slide really does hold a focusable link", () => {
    const { container, root } = renderCarousel();
    try {
      expect(slideEl(container, 0).hasAttribute("inert")).toBe(false);
      expect(slideEl(container, 0).getAttribute("aria-hidden")).toBe("false");

      for (const index of [1, 2, 3]) {
        const slide = slideEl(container, index);
        // Without this the assertion below would be vacuous: a slide with
        // nothing focusable in it could not fail the audit either way.
        expect(
          slide.querySelectorAll("a[href], button").length,
        ).toBeGreaterThan(0);
        expect(slide.hasAttribute("inert")).toBe(true);
        expect(slide.getAttribute("aria-hidden")).toBe("true");
      }
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });

  it("moves the exemption with the active slide", () => {
    const { container, root } = renderCarousel();
    try {
      const goToThird = container.querySelector<HTMLButtonElement>(
        'button[aria-label="Go to slide 3"]',
      );
      expect(goToThird).not.toBeNull();

      act(() => {
        goToThird!.click();
      });

      expect(slideEl(container, 2).hasAttribute("inert")).toBe(false);
      expect(slideEl(container, 2).getAttribute("aria-hidden")).toBe("false");
      for (const index of [0, 1, 3]) {
        expect(slideEl(container, index).hasAttribute("inert")).toBe(true);
      }
    } finally {
      act(() => root.unmount());
      container.remove();
    }
  });
});
