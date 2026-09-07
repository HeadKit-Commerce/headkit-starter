import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SectionHeader } from "./section-header";

describe("SectionHeader", () => {
  it("runs { } title markers through the heading highlight face", () => {
    const html = renderToStaticMarkup(
      <SectionHeader
        title="Crafted for {modern rituals}"
        description="Luxury Towels"
      />,
    );
    expect(html).toContain("Crafted for ");
    expect(html).toContain('class="headkit-title-emphasis"');
    expect(html).toContain("modern rituals");
    expect(html).not.toContain("{modern rituals}");
    expect(html).toContain("Luxury Towels");
  });

  it("omits the View-all slot when the label is empty", () => {
    const html = renderToStaticMarkup(
      <SectionHeader
        title="Something similar"
        allButton=""
        allButtonPath="/shop"
      />,
    );
    expect(html).not.toContain("href=");
  });
});
