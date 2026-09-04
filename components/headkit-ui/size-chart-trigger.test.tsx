import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/lib/size-guide-actions", () => ({
  getSizeGuidePageHtml: async (): Promise<string> => "<p>Guide</p>",
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: ReactNode }) => (
    <div data-size-guide-dialog="">{children}</div>
  ),
  DialogContent: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogTrigger: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

import { SizeChartTrigger } from "./size-chart-trigger";

describe("SizeChartTrigger", () => {
  it("opens a modal button instead of navigating to the Size Guide page", () => {
    const html = renderToStaticMarkup(
      <SizeChartTrigger pageHref="/size-guide" />,
    );

    expect(html).toContain('type="button"');
    expect(html).toContain("Size Guide");
    expect(html).toContain("Loading size guide…");
    expect(html).not.toContain("Size guide is not available yet.");
    expect(html).not.toContain('href="/size-guide"');
    expect(html).not.toContain("<a ");
  });

  it("renders supplied chart HTML in the dialog", () => {
    const html = renderToStaticMarkup(
      <SizeChartTrigger html="<table><tr><td>M</td></tr></table>" />,
    );

    expect(html).toContain("<table>");
    expect(html).toContain("Size Guide");
    expect(html).not.toContain('href="/size-guide"');
  });
});
