import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const detail = readFileSync(
  resolve(import.meta.dirname, "../components/headkit-ui/product-detail.tsx"),
  "utf8",
);
const multiAdd = readFileSync(
  resolve(
    import.meta.dirname,
    "../components/headkit-ui/product-multi-add.tsx",
  ),
  "utf8",
);

describe("Size Guide row layout", () => {
  it("keeps Complete the Set Size Guide on the right via justify-between", () => {
    expect(multiAdd).toContain(
      "headkit-complete-the-set-heading mb-3 flex items-center justify-between gap-3",
    );
  });

  it("renders the Shopify subtitle under the title with a 6px gap", () => {
    expect(detail).toContain(
      'className="headkit-product-subtitle mt-[6px] text-primary"',
    );
    expect(detail).toContain("productSubtitle(");
  });

  it("puts colour/size attribute Size Guide on the right like Complete the Set", () => {
    // Left cluster (label + value) + trigger on the trailing edge — not
    // inline after the colour name (which reads as left-aligned on Bundles).
    expect(detail).toContain("mb-2 flex items-center justify-between gap-2");
    expect(detail).toContain("flex min-w-0 flex-1 items-center gap-2");
    expect(detail).toMatch(
      /justify-between gap-2[\s\S]*?SizeChartTrigger[\s\S]*?pageHref=\{sizeGuideHref\}/,
    );
  });
});
