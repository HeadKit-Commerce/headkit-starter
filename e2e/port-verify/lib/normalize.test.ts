import { describe, expect, it } from "vitest";
import {
  normalizeHref,
  normalizeOrigin,
  normalizeOrigins,
  normalizeValue,
  reduceOriginHref,
} from "./normalize";
import type { NormalizeRule } from "./types";

const ORIGIN = "https://store.invalid";

describe("origin normalisation", () => {
  it("rewrites the target's own origin and leaves a third-party one alone", () => {
    expect(normalizeOrigin(`${ORIGIN}/shop/a`, ORIGIN)).toBe("{origin}/shop/a");
    // A canonical that starts naming another host is the regression, not noise.
    expect(normalizeOrigin("https://other.invalid/shop/a", ORIGIN)).toBe(
      "https://other.invalid/shop/a",
    );
  });

  it("substitutes the LONGER of two prefix origins first", () => {
    // A TLD cutover: dishee.com before, dishee.com.au after. Substituting the
    // shorter first leaves `{origin}.au/shop/x`, which matches nothing on the
    // other side, so every full-mode URL reports a canonical describing nothing.
    const pair = ["https://dishee.com", "https://dishee.com.au"];
    expect(normalizeOrigins("https://dishee.com.au/shop/x", pair)).toBe(
      "{origin}/shop/x",
    );
    expect(normalizeOrigins("https://dishee.com/shop/x", pair)).toBe(
      "{origin}/shop/x",
    );
    // Order of the list must not decide the outcome.
    expect(
      normalizeOrigins("https://dishee.com.au/shop/x", [...pair].reverse()),
    ).toBe("{origin}/shop/x");
  });

  it("is idempotent and still leaves a third-party origin alone", () => {
    const pair = [ORIGIN, "https://preview.invalid"];
    expect(normalizeOrigins("{origin}/shop/a", pair)).toBe("{origin}/shop/a");
    expect(normalizeOrigins("https://other.invalid/shop/a", pair)).toBe(
      "https://other.invalid/shop/a",
    );
  });
});

describe("reducing a normalised href back to a path", () => {
  it("reduces a leading token and leaves everything else alone", () => {
    // The run that swept the store domain wrote `/shop`; the other wrote the
    // absolute URL, which becomes `{origin}/shop`. Without this they are a
    // removed/added pair on every URL.
    expect(reduceOriginHref("{origin}/shop")).toBe("/shop");
    expect(reduceOriginHref("{origin}")).toBe("/");
    expect(reduceOriginHref("/shop")).toBe("/shop");
    expect(reduceOriginHref("https://other.invalid/x")).toBe(
      "https://other.invalid/x",
    );
    expect(reduceOriginHref("mailto:a@b.invalid")).toBe("mailto:a@b.invalid");
  });
});

describe("href normalisation", () => {
  const page = `${ORIGIN}/shop/kitchen`;
  it("reduces same-origin and relative hrefs to site-relative paths", () => {
    expect(normalizeHref(`${ORIGIN}/shop/a?x=1`, ORIGIN, page, [])).toBe(
      "/shop/a?x=1",
    );
    expect(normalizeHref("../products/x", ORIGIN, page, [])).toBe(
      "/products/x",
    );
    expect(normalizeHref("#main", ORIGIN, page, [])).toBe("/shop/kitchen#main");
  });

  it("keeps off-site links absolute so their loss is visible", () => {
    expect(normalizeHref("https://other.invalid/x", ORIGIN, page, [])).toBe(
      "https://other.invalid/x",
    );
  });

  it("preserves mailto and tel verbatim", () => {
    expect(normalizeHref("mailto:a@b.invalid", ORIGIN, page, [])).toBe(
      "mailto:a@b.invalid",
    );
  });

  it("drops an empty href rather than recording a phantom link", () => {
    expect(normalizeHref("   ", ORIGIN, page, [])).toBeNull();
  });
});

describe("plan normalisation rules", () => {
  const rules: NormalizeRule[] = [
    {
      field: "links",
      pattern: "sid=[0-9a-f]+",
      flags: "g",
      replace: "sid={session}",
      why: "session id",
    },
  ];
  it("applies only to the field it names", () => {
    expect(
      normalizeHref(`${ORIGIN}/x?sid=deadbeef`, ORIGIN, `${ORIGIN}/`, rules),
    ).toBe("/x?sid={session}");
    expect(
      normalizeValue("canonical", `${ORIGIN}/x?sid=deadbeef`, ORIGIN, rules),
    ).toBe("{origin}/x?sid=deadbeef");
  });
});
