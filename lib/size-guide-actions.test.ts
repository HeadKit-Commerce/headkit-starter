import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();

vi.mock("@/lib/sdk", () => ({
  headkit: {
    content: {
      get: (...args: unknown[]) => getMock(...args),
    },
  },
}));

import { getSizeGuidePageHtml } from "@/lib/size-guide-actions";

describe("getSizeGuidePageHtml", () => {
  beforeEach(() => {
    getMock.mockReset();
  });

  it("loads CMS HTML for a valid Size Guide path", async () => {
    getMock.mockResolvedValueOnce({ content: "  <p>Sizes</p>  " });

    await expect(getSizeGuidePageHtml("/size-guide")).resolves.toBe(
      "<p>Sizes</p>",
    );
    expect(getMock).toHaveBeenCalledWith("size-guide", "PAGE");
  });

  it("returns empty for an off-site href without fetching", async () => {
    await expect(
      getSizeGuidePageHtml("https://example.com/size-guide"),
    ).resolves.toBe("");
    expect(getMock).not.toHaveBeenCalled();
  });
});
