import { describe, expect, it } from "vitest";
import {
  DEFAULT_GOOGLE_WEIGHTS,
  normalizeGoogleWeights,
  resolveBrandFonts,
} from "@/lib/brand-fonts";

const empty = {
  source: "",
  family: "",
  googleSlug: "",
  fileUrl: "",
};

describe("resolveBrandFonts", () => {
  it("defaults all slots to Urbanist with only Urbanist @font-face", () => {
    const resolved = resolveBrandFonts({
      heading: empty,
      subheading: empty,
      body: empty,
    });
    expect(resolved.cssVars).toContain(
      "--font-heading: var(--font-slot-urbanist)",
    );
    expect(resolved.cssVars).toContain(
      "--font-body: var(--font-slot-urbanist)",
    );
    expect(resolved.fontFaceCss).toContain("Urbanist");
    expect(resolved.fontFaceCss).toContain("fontsource/fonts/urbanist@");
    expect(resolved.fontFaceCss).not.toContain("instrument-sans");
    expect(resolved.usesFontsourceCdn).toBe(true);
    expect(resolved.variableClassNames).toBe("");
  });

  it("uses curated Inter heading and omits unused families", () => {
    const resolved = resolveBrandFonts({
      heading: {
        source: "google",
        family: "Inter",
        googleSlug: "Inter",
        fileUrl: "",
      },
      subheading: empty,
      body: empty,
    });
    expect(resolved.cssVars).toContain(
      "--font-heading: var(--font-slot-inter)",
    );
    expect(resolved.fontFaceCss).toContain("fontsource/fonts/inter@");
    expect(resolved.fontFaceCss).toContain("fontsource/fonts/urbanist@");
    expect(resolved.fontFaceCss).not.toContain("playfair-display");
    expect(resolved.fontFaceCss).not.toContain("instrument-sans");
  });

  it("omits unused Urbanist when every slot is curated elsewhere (ENG-856)", () => {
    const resolved = resolveBrandFonts({
      heading: {
        source: "google",
        family: "Playfair Display",
        googleSlug: "Playfair Display",
        fileUrl: "",
      },
      subheading: {
        source: "google",
        family: "Inter",
        googleSlug: "Inter",
        fileUrl: "",
      },
      body: {
        source: "google",
        family: "Inter",
        googleSlug: "Inter",
        fileUrl: "",
      },
    });
    expect(resolved.cssVars).not.toContain("--font-slot-urbanist:");
    expect(resolved.cssVars).toContain("--font-slot-inter:");
    expect(resolved.cssVars).toContain("--font-slot-playfair:");
    expect(resolved.fontFaceCss).toContain("inter@");
    expect(resolved.fontFaceCss).toContain("playfair-display@");
    expect(resolved.fontFaceCss).not.toContain("urbanist@");
  });

  it("emits @font-face for uploads", () => {
    const resolved = resolveBrandFonts({
      heading: empty,
      subheading: empty,
      body: {
        source: "upload",
        family: "Brand Sans",
        googleSlug: "",
        fileUrl:
          "https://storage.googleapis.com/headkit-storage/branding/x.woff2",
      },
    });
    expect(resolved.fontFaceCss).toContain("@font-face");
    expect(resolved.fontFaceCss).toContain("Brand Sans");
    // Same-origin proxy (GCS lacks CORS — Chrome would otherwise skip the face).
    expect(resolved.fontFaceCss).toContain("/api/branding-font?f=x.woff2");
    expect(resolved.fontFaceCss).toContain("font-weight:100 900");
    expect(resolved.fontFaceCss).not.toContain("storage.googleapis.com");
    expect(resolved.cssVars).toContain("--font-body:");
  });

  it("uses curated Instrument Sans only (no remote Google CSS, no other faces)", () => {
    const instrument = {
      source: "google",
      family: "Instrument Sans",
      googleSlug: "Instrument Sans",
      fileUrl: "",
      googleWeights: [400, 500, 600],
    };
    const resolved = resolveBrandFonts({
      heading: instrument,
      subheading: instrument,
      body: instrument,
    });
    expect(resolved.cssVars).toContain(
      "--font-heading: var(--font-slot-instrument-sans)",
    );
    expect(resolved.cssVars).toContain(
      "--font-body: var(--font-slot-instrument-sans)",
    );
    expect(resolved.fontFaceCss).toContain("instrument-sans@");
    expect(resolved.fontFaceCss).toContain("font-weight:400");
    expect(resolved.fontFaceCss).toContain("font-weight:500");
    expect(resolved.fontFaceCss).toContain("font-weight:600");
    expect(resolved.fontFaceCss).not.toContain("urbanist@");
    expect(resolved.fontFaceCss).not.toContain("fonts.googleapis.com");
    // One family × three weights → three @font-face rules only.
    expect(resolved.fontFaceCss.match(/@font-face/g)?.length).toBe(3);
  });

  it("normalizes empty googleWeights to Regular/Medium/SemiBold", () => {
    expect(normalizeGoogleWeights([])).toEqual([...DEFAULT_GOOGLE_WEIGHTS]);
    expect(normalizeGoogleWeights([700, 400, 700, 500])).toEqual([
      400, 500, 700,
    ]);
  });

  it("falls back to Urbanist for unknown Google families (no remote CSS)", () => {
    const resolved = resolveBrandFonts({
      heading: {
        source: "google",
        family: "Some Obscure Display",
        googleSlug: "Some Obscure Display",
        fileUrl: "",
      },
      subheading: empty,
      body: empty,
    });
    expect(resolved.cssVars).toContain(
      "--font-heading: var(--font-slot-urbanist)",
    );
    expect(resolved.fontFaceCss).toContain("urbanist@");
    expect(JSON.stringify(resolved)).not.toContain("fonts.googleapis.com");
  });
});
