import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BadgeList } from "./badge-list";

describe("BadgeList", () => {
  it("keeps pills on one row, sized to their text, at a fixed height", () => {
    const html = renderToStaticMarkup(
      <BadgeList
        isNewIn
        isSale
        badges={[{ slug: "limited", label: "Limited" }]}
      />,
    );

    expect(html).toContain("flex flex-row flex-wrap items-center");
    expect(html).toContain(
      "inline-flex h-6 w-fit shrink-0 items-center whitespace-nowrap",
    );
    expect(html).toContain("New");
    expect(html).toContain("Sale");
    expect(html).toContain("Limited");
  });
});
