import { describe, expect, it } from "vitest";
import { convertToRelativePath, isAppNavigationHref } from "./convert-uri";

describe("convertToRelativePath", () => {
  it("strips the host from absolute http(s) WordPress permalinks", () => {
    expect(
      convertToRelativePath("https://commerce-backend.com/shop/general/beanie/"),
    ).toBe("/shop/general/beanie/");
    expect(convertToRelativePath("http://wp.local/about")).toBe("/about");
  });

  it("passes through already-relative paths", () => {
    expect(convertToRelativePath("/shop/product/")).toBe("/shop/product/");
    expect(convertToRelativePath("/")).toBe("/");
  });

  it("returns empty string for nullish input", () => {
    expect(convertToRelativePath(null)).toBe("");
    expect(convertToRelativePath(undefined)).toBe("");
    expect(convertToRelativePath("")).toBe("");
  });

  it("preserves tel: custom links used in WP menus (e.g. preheader phone)", () => {
    expect(convertToRelativePath("tel:1300883919")).toBe("tel:1300883919");
    expect(convertToRelativePath("tel:+611300883919")).toBe("tel:+611300883919");
  });

  it("preserves mailto: and sms: custom links", () => {
    expect(convertToRelativePath("mailto:hello@example.com")).toBe(
      "mailto:hello@example.com",
    );
    expect(convertToRelativePath("sms:+611300883919")).toBe("sms:+611300883919");
  });

  it("does not reduce tel: to a bare phone pathname", () => {
    // new URL('tel:…').pathname drops the scheme — the Paralel preheader bug.
    expect(convertToRelativePath("tel:1300883919")).not.toBe("1300883919");
  });
});

describe("isAppNavigationHref", () => {
  it("accepts in-app paths only", () => {
    expect(isAppNavigationHref("/about")).toBe(true);
    expect(isAppNavigationHref("/faq?x=1")).toBe(true);
    expect(isAppNavigationHref("tel:1300883919")).toBe(false);
    expect(isAppNavigationHref("mailto:a@b.com")).toBe(false);
    expect(isAppNavigationHref("https://example.com/x")).toBe(false);
    expect(isAppNavigationHref("//cdn.example/x")).toBe(false);
    expect(isAppNavigationHref("")).toBe(false);
  });
});
