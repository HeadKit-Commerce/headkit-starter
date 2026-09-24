import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  CONSENT_BANNER_HEIGHT_VAR,
  clearConsentBannerHeight,
  consentAwareLift,
  publishConsentBannerHeight,
} from "@/lib/consent-banner-offset";

/**
 * The claim: the consent banner and every other fixed-bottom surface agree on
 * ONE custom property, and the banner and the PDP sticky add-to-cart bar do
 * not share a stacking level.
 *
 * WHAT THIS CANNOT SEE, and it is the larger half. jsdom has no layout engine
 * and this file does not even use jsdom, so nothing here observes a box, an
 * overlap, a stacking context, a computed `bottom`, or whether the add-to-cart
 * button is clickable. It cannot tell a correct offset from an offset that
 * pushes the bar off the top of the screen, and it cannot see the CSS at all —
 * a Tailwind arbitrary value written without the underscores `calc()` needs
 * around `*` emits NO rule, and every assertion below stays green under that.
 * It is equally blind to CLS: the first version of this fix offset the sticky
 * bar with `bottom` instead of a transform and scored 0.00543 against 0.00000
 * on the store it was measured on, and nothing in this file could tell the two
 * apart. The bug this guards was found in a browser and the fix was confirmed
 * in a browser; those numbers are in the PR that introduced this.
 *
 * What it DOES hold is the pair of drifts a source reading can actually catch:
 * one end renaming the property while the other keeps the old name, and
 * someone "tidying" the banner back to `z-40` beside the bar.
 */

const repoRoot = join(import.meta.dirname, "..");

function source(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

const BANNER = source("components/headkit-ui/consent-banner.tsx");
const PRODUCT_DETAIL = source("components/headkit-ui/product-detail.tsx");
const TOAST = source("components/ui/toast.tsx");

/** The `z-40` / `z-[45]` token on the line carrying a given hook class. */
function stackingLevel(fileSource: string, hookClass: string): string {
  const line = fileSource
    .split("\n")
    .find((candidate) => candidate.includes(hookClass));
  expect(line, `no line carries ${hookClass}`).toBeDefined();
  const match = /\bz-(\[\d+\]|\d+)/.exec(line as string);
  expect(match, `no z-index utility beside ${hookClass}`).not.toBeNull();
  return (match as RegExpExecArray)[0];
}

describe("the published property", () => {
  const originalDocument = Reflect.get(globalThis, "document");

  afterEach(() => {
    if (originalDocument === undefined) {
      Reflect.deleteProperty(globalThis, "document");
    } else {
      Reflect.set(globalThis, "document", originalDocument);
    }
  });

  function fakeDocument(): {
    document: unknown;
    properties: Map<string, string>;
  } {
    const properties = new Map<string, string>();
    const document = {
      documentElement: {
        style: {
          setProperty: (name: string, value: string) =>
            void properties.set(name, value),
          removeProperty: (name: string) => void properties.delete(name),
        },
      },
    };
    return { document, properties };
  }

  it("writes a rounded pixel height and REMOVES it, never writes 0px", () => {
    const { document, properties } = fakeDocument();
    Reflect.set(globalThis, "document", document);

    publishConsentBannerHeight(118.4);
    expect(properties.get(CONSENT_BANNER_HEIGHT_VAR)).toBe("118px");

    clearConsentBannerHeight();
    // Absent, not "0px": an absent property is what lets every consumer's
    // `var(…, 0px)` fallback make the no-banner case exactly what it was.
    expect(properties.has(CONSENT_BANNER_HEIGHT_VAR)).toBe(false);
  });

  it("is inert with no document rather than throwing", () => {
    Reflect.deleteProperty(globalThis, "document");
    expect(() => publishConsentBannerHeight(64)).not.toThrow();
    expect(() => clearConsentBannerHeight()).not.toThrow();
  });

  it("builds a lift that falls back to translateY(0) with no banner", () => {
    expect(consentAwareLift()).toBe(
      `translateY(calc(var(${CONSENT_BANNER_HEIGHT_VAR}, 0px) * -1))`,
    );
  });
});

describe("the banner and the sticky bar do not share a stacking level", () => {
  it("puts the banner above the PDP sticky add-to-cart bar", () => {
    const banner = stackingLevel(BANNER, "headkit-consent-banner");
    const stickyBar = stackingLevel(
      PRODUCT_DETAIL,
      "headkit-product-sticky-bar",
    );
    expect(banner).not.toBe(stickyBar);

    const asNumber = (token: string): number =>
      Number(token.replace(/^z-\[?/, "").replace(/\]$/, ""));
    expect(asNumber(banner)).toBeGreaterThan(asNumber(stickyBar));
  });
});

describe("every fixed-bottom surface names the same property", () => {
  it("offsets the PDP sticky add-to-cart bar by it", () => {
    // The SHOWN branch, two lines below the hook class — the hidden branch
    // keeps its own `translate-y-[120%]` and must not be read instead.
    const line = PRODUCT_DETAIL.split("\n").find((candidate) =>
      candidate.includes("translate-y-[calc(var("),
    );
    expect(line).toContain(CONSENT_BANNER_HEIGHT_VAR);
    // A TRANSLATE, not a `bottom`: moving a fixed box by its position is a
    // layout-shift source. The underscores are the part that silently breaks —
    // `calc(…*-1)` without spaces is invalid CSS and Tailwind emits nothing.
    // This catches a removal, not a wrong value.
    expect(line).toContain("translate-y-[calc(var(");
    expect(line).toContain("_*_-1)]");
  });

  it("offsets the toast viewport by it at sm and up", () => {
    const line = TOAST.split("\n").find((candidate) =>
      candidate.includes("sm:translate-y-["),
    );
    expect(line).toContain(CONSENT_BANNER_HEIGHT_VAR);
  });

  it("has the banner both publish and clear it", () => {
    expect(BANNER).toContain("publishConsentBannerHeight");
    expect(BANNER).toContain("clearConsentBannerHeight");
    // The clear must be the effect's CLEANUP. Publishing without clearing
    // leaves every other surface offset by a banner that is gone — which is
    // the reported defect with the sign flipped.
    expect(BANNER).toMatch(
      /return \(\) => \{[\s\S]*?clearConsentBannerHeight\(\)/,
    );
  });
});
