import { beforeEach, describe, expect, it, vi } from "vitest";

function mockFont(variable: string) {
  return vi.fn(() => ({
    className: `class-${variable}`,
    variable,
    style: { fontFamily: variable },
  }));
}

vi.mock("next/font/google", () => ({
  Urbanist: mockFont("--font-slot-urbanist"),
  Inter: mockFont("--font-slot-inter"),
  Roboto: mockFont("--font-slot-roboto"),
  Open_Sans: mockFont("--font-slot-open-sans"),
  Lato: mockFont("--font-slot-lato"),
  Montserrat: mockFont("--font-slot-montserrat"),
  Poppins: mockFont("--font-slot-poppins"),
  Playfair_Display: mockFont("--font-slot-playfair"),
  Merriweather: mockFont("--font-slot-merriweather"),
  Raleway: mockFont("--font-slot-raleway"),
  Nunito: mockFont("--font-slot-nunito"),
  Source_Sans_3: mockFont("--font-slot-source-sans"),
  DM_Sans: mockFont("--font-slot-dm-sans"),
  Space_Grotesk: mockFont("--font-slot-space-grotesk"),
  Instrument_Sans: mockFont("--font-slot-instrument-sans"),
}));

const empty = {
  source: "",
  family: "",
  googleSlug: "",
  fileUrl: "",
};

describe("resolveBrandFonts", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("defaults all slots to Urbanist", async () => {
    const { resolveBrandFonts } = await import("@/lib/brand-fonts");
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
    expect(resolved.variableClassNames).toContain("--font-slot-urbanist");
    expect(resolved.fontFaceCss).toBe("");
  });

  it("uses curated next/font for Inter heading", async () => {
    const { resolveBrandFonts } = await import("@/lib/brand-fonts");
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
    expect(resolved.variableClassNames.length).toBeGreaterThan(0);
  });

  it("omits unused Urbanist when every slot is curated elsewhere (ENG-856)", async () => {
    const { resolveBrandFonts } = await import("@/lib/brand-fonts");
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
    expect(resolved.variableClassNames).not.toContain("--font-slot-urbanist");
    expect(resolved.variableClassNames).toContain("--font-slot-inter");
    expect(resolved.variableClassNames).toContain("--font-slot-playfair");
  });

  it("emits @font-face for uploads", async () => {
    const { resolveBrandFonts } = await import("@/lib/brand-fonts");
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
    expect(resolved.cssVars).toContain("--font-body:");
  });

  it("uses curated next/font for Instrument Sans (no remote Google CSS)", async () => {
    const { resolveBrandFonts } = await import("@/lib/brand-fonts");
    const resolved = resolveBrandFonts({
      heading: {
        source: "google",
        family: "Instrument Sans",
        googleSlug: "Instrument Sans",
        fileUrl: "",
      },
      subheading: empty,
      body: {
        source: "google",
        family: "Instrument Sans",
        googleSlug: "Instrument Sans",
        fileUrl: "",
      },
    });
    expect(resolved.cssVars).toContain(
      "--font-heading: var(--font-slot-instrument-sans)",
    );
    expect(resolved.cssVars).toContain(
      "--font-body: var(--font-slot-instrument-sans)",
    );
    expect(resolved.variableClassNames).toContain(
      "--font-slot-instrument-sans",
    );
  });

  it("falls back to Urbanist for unknown Google families (no remote CSS)", async () => {
    const { resolveBrandFonts } = await import("@/lib/brand-fonts");
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
    expect(resolved.variableClassNames).toContain("--font-slot-urbanist");
    expect(JSON.stringify(resolved)).not.toContain("fonts.googleapis.com");
  });
});
