// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_HEADER_BOTTOM_PX,
  HEADER_BOTTOM_CSS_VAR,
  HEADER_REGION_ATTRIBUTE,
  HEADER_REGION_SELECTOR,
  headerBottomCssValue,
  publishHeaderBottom,
} from "@/lib/header-bottom";

/**
 * The header-bottom binding: one measurement, published once, read by the
 * pending-navigation skeleton so it starts under the header instead of over it.
 *
 * The skeleton's own guard (`components/headkit-ui/skeletons/navigation-skeleton.test.tsx`)
 * asserts the READ side — that the overlay's `top` is `headerBottomCssValue()` and
 * never 0. This file asserts the WRITE side and the one thing neither can observe
 * from the other: that `NavigationBar` publishes at all. That last case is a
 * source-text scan, and it is a tripwire rather than a proof — it catches the call
 * disappearing by name, not a call that stops running. Mounting the real header in
 * jsdom would need the cart, auth and branding providers around it and would still
 * measure nothing, because jsdom has no layout.
 */
describe("header-bottom binding", () => {
  afterEach(() => {
    document.documentElement.style.removeProperty(HEADER_BOTTOM_CSS_VAR);
  });

  it("publishes to the property the consumer reads", () => {
    publishHeaderBottom(110);
    expect(
      document.documentElement.style.getPropertyValue(HEADER_BOTTOM_CSS_VAR),
    ).toBe("110px");
    expect(
      headerBottomCssValue(),
      "Writer and reader must name the same property; that they do is why this module exists rather than two literals.",
    ).toBe(`var(${HEADER_BOTTOM_CSS_VAR}, ${DEFAULT_HEADER_BOTTOM_PX}px)`);
  });

  it("falls back to the nav's own height before the first publish", () => {
    expect(
      document.documentElement.style.getPropertyValue(HEADER_BOTTOM_CSS_VAR),
    ).toBe("");
    expect(
      headerBottomCssValue(),
      "A consumer rendering before the header's first measurement must start under a header-sized strip, never over the header.",
    ).toContain(`${DEFAULT_HEADER_BOTTOM_PX}px`);
  });

  it("clamps an off-screen header to 0 rather than holding a stale strip", () => {
    // The starter's header is `sticky top-0` and cannot reach this, but a store
    // layout that hides the header on scroll can — and then there is nothing left
    // to uncover, so an overlay should start at the top of the viewport.
    publishHeaderBottom(-40);
    expect(
      document.documentElement.style.getPropertyValue(HEADER_BOTTOM_CSS_VAR),
    ).toBe("0px");
  });

  it("ignores a non-finite measurement instead of writing NaNpx", () => {
    publishHeaderBottom(110);
    publishHeaderBottom(Number.NaN);
    expect(
      document.documentElement.style.getPropertyValue(HEADER_BOTTOM_CSS_VAR),
    ).toBe("110px");
  });

  it("is published by the navigation bar, and marks its own region", () => {
    const source = readFileSync(
      join(__dirname, "..", "components", "headkit-ui", "navigation-bar.tsx"),
      "utf8",
    );
    expect(
      source,
      "Nothing else measures the header. If the nav stops publishing, the skeleton silently falls back to the 80px default and drifts from any preheader.",
    ).toContain("publishHeaderBottom(");
    // Both halves of the header: the preheader in normal flow and the sticky nav.
    // `HEADER_REGION_SELECTOR` is what the skeleton's press swallow exempts, so a
    // header that is not marked is a header that renders visible and dead.
    expect(source.match(/HEADER_REGION_ATTRIBUTE\]:/g)?.length ?? 0).toBe(2);
    expect(HEADER_REGION_SELECTOR).toBe(`[${HEADER_REGION_ATTRIBUTE}]`);
  });
});
