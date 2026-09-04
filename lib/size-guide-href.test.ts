import { describe, expect, it } from "vitest";
import { cmsSlugFromSizeGuideHref } from "@/lib/size-guide-href";

describe("cmsSlugFromSizeGuideHref", () => {
  it("strips slashes from a valid Size Guide path", () => {
    expect(cmsSlugFromSizeGuideHref("/size-guide")).toBe("size-guide");
    expect(cmsSlugFromSizeGuideHref("/pages/size-guide/")).toBe(
      "pages/size-guide",
    );
  });

  it("rejects empty, protocol-relative, and off-site values", () => {
    expect(cmsSlugFromSizeGuideHref("/")).toBeNull();
    expect(cmsSlugFromSizeGuideHref("//evil.example/size-guide")).toBeNull();
    expect(
      cmsSlugFromSizeGuideHref("https://example.com/size-guide"),
    ).toBeNull();
    expect(cmsSlugFromSizeGuideHref("size-guide")).toBeNull();
  });
});
