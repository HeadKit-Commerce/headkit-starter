import { describe, expect, it } from "vitest";
import { shopifyRichTextToHtml } from "./shopify-rich-text";

describe("shopifyRichTextToHtml", () => {
  it("leaves HTML and plain text unchanged", () => {
    expect(shopifyRichTextToHtml("<p>S</p>")).toBe("<p>S</p>");
    expect(shopifyRichTextToHtml("Small / Medium")).toBe("Small / Medium");
  });

  it("converts a root rich-text document", () => {
    const json = JSON.stringify({
      type: "root",
      children: [
        {
          type: "paragraph",
          children: [
            { type: "text", value: "Bath ", italic: false },
            { type: "text", value: "Sheet", italic: true },
          ],
        },
      ],
    });
    expect(shopifyRichTextToHtml(json)).toBe("<p>Bath <em>Sheet</em></p>");
  });

  it("returns invalid JSON as-is", () => {
    expect(shopifyRichTextToHtml("{not-json")).toBe("{not-json");
  });
});
