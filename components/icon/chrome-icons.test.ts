import { describe, expect, it } from "vitest";
import {
  loadChromeIcons,
  resolveChromeIcons,
} from "@/components/icon/chrome-icons";

describe("resolveChromeIcons", () => {
  it("defaults to hi2 (sync fallback)", () => {
    const icons = resolveChromeIcons(undefined);
    const hi2 = resolveChromeIcons("hi2");
    expect(icons.Search).toBe(hi2.Search);
    expect(icons.Cart).toBe(hi2.Cart);
    expect(icons.Phone).toBe(hi2.Phone);
  });

  it("sync resolver always returns hi2 even for other libraries", () => {
    const icons = resolveChromeIcons("lucide");
    expect(icons.Search).toBe(resolveChromeIcons("hi2").Search);
  });
});

describe("loadChromeIcons", () => {
  it("defaults to hi2", async () => {
    const icons = await loadChromeIcons(undefined);
    const hi2 = await loadChromeIcons("hi2");
    expect(icons.Search).toBe(hi2.Search);
    expect(icons.Cart).toBe(hi2.Cart);
    expect(icons.Phone).toBe(hi2.Phone);
  });

  it("switches to lucide", async () => {
    const icons = await loadChromeIcons("lucide");
    const hi2 = await loadChromeIcons("hi2");
    expect(icons.Search).not.toBe(hi2.Search);
    expect(icons.Phone).not.toBe(hi2.Phone);
  });

  it("falls back for unknown libraries", async () => {
    const icons = await loadChromeIcons("not-a-library");
    const hi2 = await loadChromeIcons("hi2");
    expect(icons.Search).toBe(hi2.Search);
  });
});
