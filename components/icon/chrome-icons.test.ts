import { describe, expect, it } from "vitest";
import { resolveChromeIcons } from "@/components/icon/chrome-icons";

describe("resolveChromeIcons", () => {
  it("defaults to hi2", () => {
    const icons = resolveChromeIcons(undefined);
    const hi2 = resolveChromeIcons("hi2");
    expect(icons.Search).toBe(hi2.Search);
    expect(icons.Cart).toBe(hi2.Cart);
  });

  it("switches to lucide", () => {
    const icons = resolveChromeIcons("lucide");
    const hi2 = resolveChromeIcons("hi2");
    expect(icons.Search).not.toBe(hi2.Search);
  });

  it("falls back for unknown libraries", () => {
    const icons = resolveChromeIcons("not-a-library");
    expect(icons.Search).toBe(resolveChromeIcons("hi2").Search);
  });
});
