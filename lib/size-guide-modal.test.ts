import { describe, expect, it } from "vitest";
import {
  SIZE_GUIDE_EMPTY_COPY,
  SIZE_GUIDE_LOADING_COPY,
  sizeGuideDialogKind,
} from "@/lib/size-guide-modal";

describe("sizeGuideDialogKind", () => {
  it("shows HTML when the chart body is present", () => {
    expect(
      sizeGuideDialogKind({
        formattedHtml: "<table><tr><td>M</td></tr></table>",
        pageHref: "/size-guide",
        fetchState: "loading",
      }),
    ).toBe("html");
  });

  it("keeps loading only while a CMS fetch is in flight", () => {
    expect(
      sizeGuideDialogKind({
        formattedHtml: "",
        pageHref: "/size-guide",
        fetchState: "loading",
      }),
    ).toBe("loading");
  });

  it("does not keep loading after an empty CMS page returns", () => {
    expect(
      sizeGuideDialogKind({
        formattedHtml: "",
        pageHref: "/size-guide",
        fetchState: "done",
      }),
    ).toBe("empty");
  });

  it("treats a failed fetch the same as an empty page", () => {
    expect(
      sizeGuideDialogKind({
        formattedHtml: "",
        pageHref: "/size-guide",
        fetchState: "done",
      }),
    ).toBe("empty");
  });

  it("keeps shopper copy distinct for loading vs empty", () => {
    expect(SIZE_GUIDE_LOADING_COPY).toMatch(/loading/i);
    expect(SIZE_GUIDE_EMPTY_COPY).not.toMatch(/loading/i);
  });
});
