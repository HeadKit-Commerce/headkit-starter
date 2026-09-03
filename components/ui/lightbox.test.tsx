import type { ReactNode } from "react";
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Lightbox } from "./lightbox";

vi.mock("next/image", () => ({
  default: (props: {
    alt?: string;
    src?: string;
    className?: string;
    style?: { transform?: string };
  }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={props.alt ?? ""}
      src={typeof props.src === "string" ? props.src : ""}
      className={props.className}
      data-transform={props.style?.transform}
    />
  ),
}));

vi.mock("@/components/icon", () => ({
  ChevronLeftIcon: () => <span data-icon="chevron-left" />,
  ChevronRightIcon: () => <span data-icon="chevron-right" />,
  MinusIcon: () => <span data-icon="minus" />,
  PlusIcon: () => <span data-icon="plus" />,
}));

vi.mock("@/components/ui/dialog", () => ({
  DialogContent: ({
    children,
    className,
  }: {
    children: ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => (
    <p>{children}</p>
  ),
}));

const IMAGES = [
  { src: "/a.jpg", alt: "Front" },
  { src: "/b.jpg", alt: "Back" },
];

describe("Lightbox zoom chrome", () => {
  it("renders zoom controls and a zoom-in cursor at rest", () => {
    const html = renderToStaticMarkup(
      <Lightbox images={IMAGES} initialSelectedIndex={0} />,
    );
    expect(html).toContain('data-lightbox-zoom="1"');
    expect(html).toContain("cursor-zoom-in");
    expect(html).toContain('aria-label="Zoom in"');
    expect(html).toContain('aria-label="Zoom out"');
    expect(html).toContain('data-transform="translate(0px, 0px) scale(1)"');
    expect(html).toContain("Zoom out");
  });

  it("keeps zoom available when there is only one image", () => {
    const html = renderToStaticMarkup(
      <Lightbox images={[IMAGES[0]!]} initialSelectedIndex={0} />,
    );
    expect(html).toContain('aria-label="Zoom in"');
    expect(html).not.toContain("Previous image");
  });
});

describe("Dialog close pointer", () => {
  it("uses a pointer cursor on the shared dialog close control", () => {
    const source = readFileSync(
      new URL("./dialog.tsx", import.meta.url),
      "utf8",
    );
    expect(source).toContain(
      "absolute right-4 top-4 z-10 cursor-pointer rounded-sm",
    );
  });
});
