import { describe, expect, it } from "vitest";
import { sizeGuideDialogKind } from "@/lib/size-guide-modal";

describe("sizeGuideDialogKind", () => {
  it("shows HTML when the chart body is present", () => {
    expect(
      sizeGuideDialogKind({
        formattedHtml: "<table><tr><td>M</td></tr></table>",
      }),
    ).toBe("html");
  });

  it("stays blank while a CMS fetch is in flight", () => {
    expect(sizeGuideDialogKind({ formattedHtml: "" })).toBe("blank");
  });

  it("stays blank after an empty CMS page returns", () => {
    expect(sizeGuideDialogKind({ formattedHtml: "   " })).toBe("blank");
  });
});
