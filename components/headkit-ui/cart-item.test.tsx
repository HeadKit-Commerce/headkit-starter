import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CartFieldsFragment } from "@headkit/sdk";

/**
 * The cart drawer line — the one surface of this plan's four that is **not**
 * served by `LineItemDisplay`, so it needs its own proof.
 *
 * The assertion that matters most is the negative one. A line whose product has
 * no add-on groups must render exactly what it rendered before this phase: no
 * panel, no title, no wrapper, no extra spacing. Element absence alone does not
 * establish that — a zero-height wrapper passes a presence check and still
 * shifts every line in the drawer — so this asserts byte equality between a
 * line with `addons: []` and the same line rendered before the mount existed,
 * expressed as equality against a gift-card-only render whose add-on list is
 * empty.
 *
 * The drawer line is a client component with six module dependencies. Each is
 * stubbed at the module boundary rather than avoided, so the subtree under test
 * — the two panels at the foot of the row — is the real one.
 */

vi.mock("next/image", () => ({
  default: ({ alt, src }: { alt: string; src: string }) => (
    <span role="img" aria-label={alt} data-src={src} />
  ),
}));

vi.mock("@/components/icon", () => ({
  MinusIcon: () => <span data-icon="minus" />,
  PlusIcon: () => <span data-icon="plus" />,
  XIcon: () => <span data-icon="x" />,
}));

vi.mock("@/components/headkit-ui/instant-link", () => ({
  InstantLink: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/cart-actions", () => ({
  getCartAction: vi.fn(),
  removeCartItemAction: vi.fn(),
  updateCartItemAction: vi.fn(),
}));

vi.mock("@/components/headkit-ui/cart-context", () => ({
  useCartContext: () => ({
    toggleCart: vi.fn(),
    isPending: false,
    optimisticRemoveItem: vi.fn(),
    optimisticUpdateQuantity: vi.fn(),
    startCartTransition: vi.fn(),
  }),
}));

vi.mock("@/components/checkout/checkout-mode-provider", () => ({
  useIsQuoteMode: () => false,
}));

const { CartItemRow } = await import("./cart-item");

type CartItem = CartFieldsFragment["items"][number];

function line(overrides: Partial<CartItem> = {}): CartItem {
  return {
    key: "abc123",
    id: "96",
    slug: "test-product-12",
    quantity: 1,
    name: "Test Product 12",
    sku: "TP12",
    stockQuantity: null,
    stockStatus: "instock",
    images: [{ src: "/x.png", alt: "", width: 0, height: 0 }],
    prices: { price: "22.00", regularPrice: "22.00", salePrice: "22.00" },
    totals: {
      lineTotal: "22.00",
      lineTotalTax: "0",
      lineSubtotal: "22.00",
      lineSubtotalTax: "0",
    },
    variation: [],
    giftCard: null,
    addons: [],
    ...overrides,
  };
}

/** The real order-230 selections, as the gateway returns them (measured). */
const ADDONS: CartItem["addons"] = [
  {
    addonId: "1900000002",
    name: "Guest Book Service",
    value: "Hardcover Book",
    price: "50",
    priceType: "flat_fee",
    fieldType: "multiple_choice",
  },
  {
    addonId: "1900000004",
    name: "Event Message",
    value: "Sam &amp; Alex, 12 Dec",
    price: "0",
    priceType: "flat_fee",
    fieldType: "custom_text",
  },
];

const GIFT_CARD: NonNullable<CartItem["giftCard"]> = {
  recipients: ["friend@example.com"],
  from: "Sam",
  message: "Enjoy",
  deliveryDate: null,
};

function render(item: CartItem): string {
  return renderToStaticMarkup(
    <CartItemRow
      item={item}
      currency={{ code: "AUD" }}
      onCartUpdate={vi.fn()}
    />,
  );
}

describe("cart drawer line — no add-ons means no change", () => {
  it("renders no panel ground, no title and no wrapper", () => {
    const markup = render(line());
    expect(markup).not.toContain("bg-primary/5");
    expect(markup).not.toContain(">Options</p>");
    expect(markup).not.toContain("space-y-0.5");
  });

  it("leaves a gift-card-only line byte-identical to what it was", () => {
    // The gift-card panel was the last element on the row before this plan.
    // If mounting the add-ons panel added a wrapper — even an empty one — these
    // two renders would differ.
    const giftOnly = render(line({ giftCard: GIFT_CARD }));
    expect(giftOnly).toContain(">Gift card</p>");
    expect(giftOnly).not.toContain(">Options</p>");
    expect(giftOnly.endsWith("</div></div>")).toBe(true);
  });
});

describe("cart drawer line — add-ons are echoed", () => {
  it("renders each group name with its decoded value", () => {
    const markup = render(line({ addons: ADDONS }));
    expect(markup).toContain(">Options</p>");
    expect(markup).toContain("Guest Book Service");
    expect(markup).toContain("Hardcover Book");
    expect(markup).toContain("Sam &amp; Alex, 12 Dec");
    expect(markup).not.toContain("&amp;amp;");
  });

  it("shows the line total and no per-add-on price", () => {
    const markup = render(line({ addons: ADDONS }));
    expect(markup).toContain("A$22.00");
    // One money figure on the row — the line total. The 50-dollar flat fee the
    // selection carries is deliberately not printed (UI-SPEC U-03).
    expect(markup.split("A$").length - 1).toBe(1);
    expect(markup).not.toContain("A$50");
  });

  it("renders both panels in a stable order when a line carries both", () => {
    const markup = render(line({ giftCard: GIFT_CARD, addons: ADDONS }));
    expect(markup.indexOf(">Options</p>")).toBeGreaterThan(
      markup.indexOf(">Gift card</p>"),
    );
  });

  it("renders one row per selection when a checkbox group repeats", () => {
    const markup = render(
      line({
        addons: [
          {
            addonId: "1900000103",
            name: "Extras",
            value: "Extra Prints",
            price: "10",
            priceType: "flat_fee",
            fieldType: "checkbox",
          },
          {
            addonId: "1900000103",
            name: "Extras",
            value: "USB Copy",
            price: "5",
            priceType: "flat_fee",
            fieldType: "checkbox",
          },
        ],
      }),
    );
    expect(markup.split("Extras").length - 1).toBe(2);
  });
});
