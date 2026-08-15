import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * `LineItemDisplay` is one component serving three of this plan's four
 * surfaces — the checkout summary, the order confirmation and the account order
 * detail. It takes its optional panel data as an explicit prop, so adding the
 * add-ons panel means editing the component **and** all three call sites; the
 * pattern map's claim that the work collapses to two files is wrong, and the
 * call-site assertions at the bottom of this file are what keep it honest.
 *
 * The property that costs the most if it breaks is the *negative* one: a line
 * with no add-on selections must render exactly what it rendered before this
 * phase. An empty wrapper is invisible to a presence check and shifts every
 * line on four surfaces, so the assertion here is byte equality between the
 * "prop omitted" and "prop present but empty" renders, not element absence.
 *
 * `next/image` is stubbed to a plain `<img>`: outside the Next runtime the real
 * component reaches for loader config this test has no business supplying. The
 * stub sits below the part of the tree under test — every add-on assertion
 * reads markup the stub never touches.
 */

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    className,
  }: {
    src: string;
    alt: string;
    className?: string;
    // A stub, not a rendered image: `next/image`'s LCP guidance is about pages
    // shipped to shoppers, and nothing below this line is under test.
  }) => (
    <span role="img" aria-label={alt} data-src={src} className={className} />
  ),
}));

const { LineItemDisplay } = await import("./line-item-display");

const BASE = {
  name: "Test Product 12",
  images: [{ src: "/x.png", alt: "" }],
  quantity: 1,
  lineSubtotal: "22.00",
  currency: "AUD",
};

/** The real order-230 selections, as the gateway returns them (measured). */
const ORDER_230 = [
  { addonId: "1900000001", name: "Add-ons", value: "Animated Welcome Screen" },
  {
    addonId: "1900000002",
    name: "Guest Book Service",
    value: "Hardcover Book",
  },
  {
    addonId: "1900000004",
    name: "Event Message",
    value: "Sam &amp; Alex, 12 Dec",
  },
];

const GIFT_CARD = {
  recipients: ["friend@example.com"],
  from: "Sam",
  message: "Enjoy",
  deliveryDate: null,
};

const SRC_DIR = resolve(__dirname);
const APP_DIR = resolve(SRC_DIR, "../../app");

const sources: Record<string, string> = {
  "line-item-display.tsx": readFileSync(
    resolve(SRC_DIR, "line-item-display.tsx"),
    "utf8",
  ),
  "cart.tsx": readFileSync(resolve(SRC_DIR, "cart.tsx"), "utf8"),
  "success/[orderId]/page.tsx": readFileSync(
    resolve(APP_DIR, "checkout/success/[orderId]/page.tsx"),
    "utf8",
  ),
  "account orders/[orderId]/page.tsx": readFileSync(
    resolve(APP_DIR, "account/(private)/orders/[orderId]/page.tsx"),
    "utf8",
  ),
};

describe("LineItemDisplay — a line with no add-ons is unchanged", () => {
  it("renders byte-identically whether the prop is omitted or an empty list", () => {
    const omitted = renderToStaticMarkup(<LineItemDisplay {...BASE} />);
    const empty = renderToStaticMarkup(
      <LineItemDisplay {...BASE} addons={[]} />,
    );
    expect(empty).toBe(omitted);
  });

  it("contributes no panel ground, no title and no wrapper", () => {
    const markup = renderToStaticMarkup(<LineItemDisplay {...BASE} />);
    expect(markup).not.toContain("bg-primary/5");
    expect(markup).not.toContain(">Options</p>");
    expect(markup).not.toContain("space-y-0.5");
  });

  it("leaves the gift-card line untouched when only a gift card is present", () => {
    const withGift = renderToStaticMarkup(
      <LineItemDisplay {...BASE} giftCard={GIFT_CARD} />,
    );
    const withGiftAndEmptyAddons = renderToStaticMarkup(
      <LineItemDisplay {...BASE} giftCard={GIFT_CARD} addons={[]} />,
    );
    expect(withGiftAndEmptyAddons).toBe(withGift);
    expect(withGift).toContain(">Gift card</p>");
  });
});

describe("LineItemDisplay — a line with add-ons echoes them", () => {
  it("renders the panel with every group name and its decoded value", () => {
    const markup = renderToStaticMarkup(
      <LineItemDisplay {...BASE} addons={ORDER_230} />,
    );
    expect(markup).toContain(">Options</p>");
    expect(markup).toContain("Guest Book Service:");
    expect(markup).toContain("Hardcover Book");
    expect(markup).toContain("Sam &amp; Alex, 12 Dec");
    expect(markup).not.toContain("&amp;amp;");
  });

  it("renders both panels in a stable order when a line carries both", () => {
    const markup = renderToStaticMarkup(
      <LineItemDisplay {...BASE} giftCard={GIFT_CARD} addons={ORDER_230} />,
    );
    expect(markup.indexOf(">Gift card</p>")).toBeGreaterThan(-1);
    expect(markup.indexOf(">Options</p>")).toBeGreaterThan(
      markup.indexOf(">Gift card</p>"),
    );
  });

  it("still shows the line total — the only money on the row", () => {
    const markup = renderToStaticMarkup(
      <LineItemDisplay {...BASE} addons={ORDER_230} />,
    );
    expect(markup).toContain("A$22.00");
    // No per-add-on figure joins it.
    expect(markup.split("A$").length - 1).toBe(1);
  });
});

describe("LineItemDisplay — the contract with its call sites", () => {
  it("re-exports the panel's display type, mirroring the gift-card re-export", () => {
    const src = sources["line-item-display.tsx"]!;
    expect(src).toContain("AddonDisplay");
    expect(/export type \{[^}]*AddonDisplay[^}]*\}/.test(src)).toBe(true);
    expect(/export type \{[^}]*GiftCardDisplay[^}]*\}/.test(src)).toBe(true);
  });

  it.each([
    ["cart.tsx"],
    ["success/[orderId]/page.tsx"],
    ["account orders/[orderId]/page.tsx"],
  ])("%s passes the addons prop exactly once", (file) => {
    const src = sources[file]!;
    expect(src.split(/\baddons=\{/).length - 1).toBe(1);
  });

  it.each(Object.keys(sources))(
    "%s introduces no optional chaining or null guard on the addons field",
    (file) => {
      const src = sources[file]!;
      // The schema types it `[CartItemAddonSelection!]!` with an empty default
      // (D-14.1-04): a client can never receive null, so a defensive access
      // would assert a contract the schema forbids and would hide a real
      // regression if the field ever did go missing.
      expect(/addons\s*\?\./.test(src)).toBe(false);
      expect(/\.addons\s*\?\?/.test(src)).toBe(false);
      expect(/addons\s*\|\|/.test(src)).toBe(false);
    },
  );
});
