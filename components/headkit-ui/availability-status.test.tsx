import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AvailabilityStatus, resolveAvailability } from "./availability-status";

/**
 * The availability line resolves on the SERVER, not after hydration.
 *
 * The defect: the status lived in a `useState`/`useEffect` pair seeded with
 * `IN_STOCK`, so the server render and the first client paint said "In Stock"
 * for every product — an out-of-stock PDP included — until hydration corrected
 * it. The static renders below are the whole point: `renderToStaticMarkup`
 * runs no effect, so a line that reads correctly here is a line that reads
 * correctly on first paint.
 *
 * What this does NOT cover: how long that wrong paint lasted, or that the
 * shopper actually saw it. That is a browser observation. This holds the
 * property that makes it impossible.
 */

describe("resolveAvailability", () => {
  it("reads In Stock / Only N in Stock / Out of Stock", () => {
    expect(
      resolveAvailability({ stockStatus: "instock", stockQuantity: 12 }),
    ).toEqual({ status: "IN_STOCK", label: "In Stock" });
    expect(
      resolveAvailability({ stockStatus: "instock", stockQuantity: 2 }),
    ).toEqual({ status: "LOW_STOCK", label: "Only 2 in Stock" });
    expect(
      resolveAvailability({ stockStatus: "outofstock", stockQuantity: 0 }),
    ).toEqual({ status: "OUT_OF_STOCK", label: "Out of Stock" });
  });

  it("reports a backorder as such", () => {
    expect(
      resolveAvailability({ stockStatus: "onbackorder", stockQuantity: 0 }),
    ).toEqual({ status: "ON_BACKORDER", label: "Available on backorder" });
  });

  it("treats an absent quantity as unmanaged stock, not as zero", () => {
    expect(resolveAvailability({ stockStatus: "instock" }).status).toBe(
      "IN_STOCK",
    );
    expect(
      resolveAvailability({ stockStatus: "instock", stockQuantity: null })
        .status,
    ).toBe("IN_STOCK");
  });

  it("puts out of stock ahead of backorder, and backorder ahead of the low count", () => {
    expect(
      resolveAvailability({ stockStatus: "outofstock", stockQuantity: 0 })
        .status,
    ).toBe("OUT_OF_STOCK");
    expect(
      resolveAvailability({ stockStatus: "onbackorder", stockQuantity: 1 })
        .status,
    ).toBe("ON_BACKORDER");
  });
});

describe("AvailabilityStatus first paint", () => {
  it("paints Out of Stock on the server, not In Stock", () => {
    const html = renderToStaticMarkup(
      <AvailabilityStatus stockStatus="outofstock" stockQuantity={0} />,
    );
    expect(html).toContain('data-status="OUT_OF_STOCK"');
    expect(html).toContain("Out of Stock");
    expect(html).not.toContain("In Stock");
    expect(html).toContain("text-pink-800");
  });

  it("paints the low-stock count on the server", () => {
    const html = renderToStaticMarkup(
      <AvailabilityStatus stockStatus="instock" stockQuantity={2} />,
    );
    expect(html).toContain('data-status="LOW_STOCK"');
    expect(html).toContain("Only 2 in Stock");
    expect(html).toContain("text-orange-500");
  });

  it("paints a backorder on the server", () => {
    const html = renderToStaticMarkup(
      <AvailabilityStatus stockStatus="onbackorder" stockQuantity={0} />,
    );
    expect(html).toContain('data-status="ON_BACKORDER"');
    expect(html).toContain("Available on backorder");
  });

  it("still paints In Stock for a stocked product", () => {
    const html = renderToStaticMarkup(
      <AvailabilityStatus stockStatus="instock" stockQuantity={12} />,
    );
    expect(html).toContain('data-status="IN_STOCK"');
    expect(html).toContain("In Stock");
    expect(html).toContain("text-lime-900");
  });
});
