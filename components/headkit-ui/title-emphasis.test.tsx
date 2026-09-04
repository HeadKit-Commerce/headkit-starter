import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { TitleEmphasis } from "./title-emphasis";

describe("TitleEmphasis", () => {
  it("italicises { } spans when highlight is on (heading font)", () => {
    const html = renderToStaticMarkup(
      <TitleEmphasis text="Monogram {Bath Sheet}" highlight />,
    );
    expect(html).toContain("Monogram ");
    expect(html).toContain('class="headkit-title-emphasis"');
    expect(html).toContain("Bath Sheet");
    expect(html).not.toContain("{Bath Sheet}");
  });

  it("strips { } markers when highlight is off (subheading / body)", () => {
    const html = renderToStaticMarkup(
      <TitleEmphasis text="Monogram {Bath Sheet}" />,
    );
    expect(html).toBe("Monogram Bath Sheet");
    expect(html).not.toContain("headkit-title-emphasis");
    expect(html).not.toContain("{");
  });
});
