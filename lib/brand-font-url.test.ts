import { describe, expect, it } from "vitest";
import {
  brandingFontGcsUrl,
  isSafeBrandingFontFileName,
  toSameOriginBrandFontUrl,
} from "@/lib/brand-font-url";

describe("brand-font-url", () => {
  it("accepts safe branding font file names", () => {
    expect(
      isSafeBrandingFontFileName(
        "6a6c3de612d64ddfde6a6554_branding_font_heading.woff2",
      ),
    ).toBe(true);
    expect(isSafeBrandingFontFileName("../etc/passwd.woff2")).toBe(false);
    expect(isSafeBrandingFontFileName("logo.png")).toBe(false);
  });

  it("rewrites HeadKit GCS branding fonts to the same-origin proxy", () => {
    expect(
      toSameOriginBrandFontUrl(
        "https://storage.googleapis.com/headkit-storage/branding/store_branding_font_heading.woff2?v=123",
      ),
    ).toBe("/api/branding-font?f=store_branding_font_heading.woff2&v=123");
  });

  it("leaves non-GCS URLs unchanged", () => {
    const other = "https://cdn.example.com/fonts/brand.woff2";
    expect(toSameOriginBrandFontUrl(other)).toBe(other);
  });

  it("builds a GCS URL only for safe names", () => {
    expect(brandingFontGcsUrl("x.woff2", "9")).toBe(
      "https://storage.googleapis.com/headkit-storage/branding/x.woff2?v=9",
    );
    expect(brandingFontGcsUrl("../x.woff2")).toBeNull();
  });
});
