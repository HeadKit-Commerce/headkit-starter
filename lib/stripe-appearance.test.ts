import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildCheckoutAppearance,
  readBodyFontFamily,
  readBrandCssVar,
} from "./stripe-appearance";

describe("readBrandCssVar", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns fallback when window is unavailable", () => {
    vi.stubGlobal("window", undefined);
    expect(readBrandCssVar("--color-primary", "#abc")).toBe("#abc");
  });

  it("reads trimmed :root custom properties", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      documentElement: {},
    });
    vi.stubGlobal("getComputedStyle", () => ({
      getPropertyValue: (name: string) =>
        name === "--color-primary" ? "  #57734d  " : "",
    }));
    expect(readBrandCssVar("--color-primary", "#abc")).toBe("#57734d");
  });
});

describe("readBodyFontFamily", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns computed body font-family", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", { body: {} });
    vi.stubGlobal("getComputedStyle", () => ({
      fontFamily: '"Instrument Sans", sans-serif',
      getPropertyValue: () => "",
    }));
    expect(readBodyFontFamily()).toBe('"Instrument Sans", sans-serif');
  });
});

describe("buildCheckoutAppearance", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("maps brand primary and radius into Stripe variables and Input rules", () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal("document", {
      documentElement: {},
      body: {},
    });
    vi.stubGlobal("getComputedStyle", (el: object) => {
      if (el === document.body) {
        return {
          fontFamily: "Urbanist, sans-serif",
          getPropertyValue: () => "",
        };
      }
      return {
        fontFamily: "",
        getPropertyValue: (name: string) => {
          const map: Record<string, string> = {
            "--color-primary": "#57734d",
            "--color-text": "#2d4236",
            "--radius": "1.25rem",
          };
          return map[name] ?? "";
        },
      };
    });

    const appearance = buildCheckoutAppearance();
    expect(appearance.variables?.colorPrimary).toBe("#57734d");
    expect(appearance.variables?.borderRadius).toBe("1.25rem");
    expect(appearance.variables?.colorText).toBe("#2d4236");
    expect(appearance.variables?.fontFamily).toBe("Urbanist, sans-serif");
    expect(appearance.rules?.[".Input"]?.outline).toBe("1px solid #57734d");
    expect(appearance.rules?.[".Input"]?.borderRadius).toBe("1.25rem");
    expect(appearance.rules?.[".Input:focus"]?.outline).toBe(
      "2px solid #57734d",
    );
    expect(appearance.rules?.[".Checkbox"]?.border).toBe("1px solid #57734d");
    expect(appearance.rules?.[".Checkbox:focus"]?.outline).toBe(
      "2px solid #57734d",
    );
    expect(appearance.rules?.[".Checkbox--checked"]?.backgroundColor).toBe(
      "#57734d",
    );
    expect(appearance.rules?.[".AccordionItem"]).toBeUndefined();
  });
});
