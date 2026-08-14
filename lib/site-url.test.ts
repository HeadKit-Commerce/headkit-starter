import { describe, expect, it } from "vitest";
import { normalizeSiteUrl, resolveSiteUrl } from "./site-url";

describe("normalizeSiteUrl", () => {
  it("normalises a bare host to https origin", () => {
    expect(normalizeSiteUrl("paralelfurniture.com.au")).toBe(
      "https://paralelfurniture.com.au",
    );
  });

  it("strips a trailing slash from an absolute url", () => {
    expect(normalizeSiteUrl("https://shop.example/")).toBe(
      "https://shop.example",
    );
  });

  it("preserves http and non-default ports", () => {
    expect(normalizeSiteUrl("http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });

  it("returns empty for blank or unusable input", () => {
    expect(normalizeSiteUrl("")).toBe("");
    expect(normalizeSiteUrl("   ")).toBe("");
    expect(normalizeSiteUrl("not a host")).toBe("");
  });
});

describe("resolveSiteUrl", () => {
  it("prefers the runtime store domain over a stale build-time env url", () => {
    expect(
      resolveSiteUrl(
        "paralelfurniture.com.au",
        "https://paralel-furniture.headkit.app",
      ),
    ).toBe("https://paralelfurniture.com.au");
  });

  it("falls back to the frontend env url when store domain is unset", () => {
    expect(resolveSiteUrl(null, "https://paralel-furniture.headkit.app")).toBe(
      "https://paralel-furniture.headkit.app",
    );
  });

  it("returns empty when neither source is usable", () => {
    expect(resolveSiteUrl(null, null)).toBe("");
    expect(resolveSiteUrl("", "")).toBe("");
  });
});
