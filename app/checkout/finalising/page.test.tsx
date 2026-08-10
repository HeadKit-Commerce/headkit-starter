import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import CheckoutFinalisingPage, { metadata } from "./page";

/**
 * `/checkout/finalising` — the holding page a legacy V1 payment return is
 * redirected to by `app/api/checkout/confirm/route.ts` (MIG-04).
 *
 * Two properties are load-bearing and both are asserted here rather than
 * assumed:
 *   1. it renders with NO data read, so it still serves when the catalogue
 *      backend is unreachable — the exact condition that produces a stranded
 *      shopper (this file mocks nothing but `next/link`, and a render that
 *      needed the SDK, branding or `fetch` would fail here);
 *   2. it displays no order number, amount or payment identifier, because it
 *      can verify none of them and an unverified figure shown to a shopper
 *      holding a charged card is worse than none (T-15.1-09-04).
 *
 * `next/link` is stubbed to a plain anchor: outside the Next runtime the real
 * component has no router context. The `href` is asserted from the rendered
 * markup, so the contact route is still proven, not assumed.
 */

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
  } & Record<string, unknown>) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function render(): string {
  return renderToStaticMarkup(<CheckoutFinalisingPage />);
}

describe("/checkout/finalising holding page", () => {
  it("is NON-INDEXING — a transient payment-return surface must never reach search results", () => {
    expect(
      metadata.robots,
      "the holding page exported no robots metadata — it would be indexable (T-15.1-09-05)",
    ).toMatchObject({ index: false, follow: false });
  });

  it("renders with no data read at all, so it serves when every backend is down", () => {
    // No SDK, branding or fetch mock is installed. If the page acquired a data
    // read, this render would throw rather than return markup.
    expect(
      () => render(),
      "the holding page no longer renders standalone — it acquired a data dependency, and the last-resort page is exactly the one that must not have any",
    ).not.toThrow();
  });

  it("tells the shopper something TRUE: payment received, order being finalised, confirmation by email", () => {
    const html = render().toLowerCase();

    expect(
      html,
      "the page does not acknowledge the payment — a shopper whose card was charged must not be left thinking the money vanished",
    ).toContain("payment received");
    expect(
      html,
      "the page does not say the order is still being finalised — it must not imply a confirmed order it cannot verify",
    ).toContain("finalising your order");
    expect(html, "no mention of the email confirmation to follow").toContain(
      "email",
    );
  });

  it("routes the shopper to the store's contact page when no confirmation arrives", () => {
    expect(
      render(),
      "the page offers no way to reach the store — an actionable dead end is the whole point of this route",
    ).toContain('href="/contact"');
  });

  it("shows NO order number, amount or payment identifier — it can verify none of them", () => {
    const html = render();

    expect(
      html,
      "a payment identifier appeared on the holding page (T-15.1-09-04)",
    ).not.toContain("pi_");
    expect(
      html,
      "a currency amount appeared on the holding page — the page cannot verify what was charged",
    ).not.toMatch(/[$£€]\s?\d/);
    expect(
      html,
      "an order-number-shaped figure appeared on the holding page — an unverified number is worse than none",
    ).not.toMatch(/#\s?\d/);
    expect(
      html.toLowerCase(),
      "the page names an order number field it cannot populate truthfully",
    ).not.toContain("order number");
  });
});
