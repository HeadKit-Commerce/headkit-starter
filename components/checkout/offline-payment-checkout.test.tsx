import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { CartFieldsFragment } from "@headkit/sdk";

/**
 * The offline checkout is the ONLY path a merchant without Stripe has, so the
 * assertions here are about what a shopper can actually see and press: the
 * gateway they are paying by, every field WooCommerce requires, and a submit.
 *
 * The negative case matters as much: a shippable cart with no rate selected
 * must show a blocking message and a disabled submit, because the finalize
 * would otherwise fail with a WooCommerce REST error the shopper cannot act on.
 *
 * Module boundaries are stubbed rather than avoided so the subtree under test
 * is the real component.
 */

vi.mock("@/components/headkit-ui/cart-context", () => ({
  useCartContext: () => ({ setCartData: vi.fn(), toggleCart: vi.fn() }),
}));
vi.mock("@/app/checkout/actions", () => ({ processCheckoutAction: vi.fn() }));
vi.mock("@/lib/cart-actions", () => ({ clearCartTokenAction: vi.fn() }));
vi.mock("@/components/checkout/clear-cart", () => ({ EMPTY_CART: {} }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const { OfflinePaymentCheckout } = await import("./offline-payment-checkout");

function cart(over: Partial<CartFieldsFragment> = {}): CartFieldsFragment {
  return {
    __typename: "Cart",
    token: "t",
    itemsCount: 1,
    needsPayment: true,
    needsShipping: false,
    paymentMethods: ["bacs"],
    currency: {
      __typename: "Currency",
      code: "AUD",
      symbol: "$",
      minorUnit: 2,
    },
    items: [],
    coupons: [],
    appliedGiftCards: [],
    totals: {
      __typename: "CartTotals",
      totalItems: "200",
      totalItemsTax: "0",
      totalDiscount: "0",
      totalDiscountTax: "0",
      totalShipping: "0",
      totalShippingTax: "0",
      totalPrice: "200",
      totalTax: "0",
    },
    shippingRates: [],
    ...over,
  } as CartFieldsFragment;
}

describe("OfflinePaymentCheckout", () => {
  it("names the single gateway rather than making the shopper choose", () => {
    const html = renderToStaticMarkup(
      <OfflinePaymentCheckout cart={cart({ paymentMethods: ["bacs"] })} />,
    );
    expect(html).toContain("Direct bank transfer");
    // One gateway is stated, not offered as a radio group.
    expect(html).not.toContain('type="radio"');
  });

  it("offers a radio per gateway when the store enables more than one", () => {
    const html = renderToStaticMarkup(
      <OfflinePaymentCheckout
        cart={cart({ paymentMethods: ["bacs", "cod"] })}
      />,
    );
    expect(html).toContain('type="radio"');
    expect(html).toContain("Direct bank transfer");
    expect(html).toContain("Cash on delivery");
  });

  it("collects every field WooCommerce requires to place an order", () => {
    const html = renderToStaticMarkup(<OfflinePaymentCheckout cart={cart()} />);
    for (const id of [
      "offline-email",
      "offline-first-name",
      "offline-last-name",
      "offline-address1",
      "offline-city",
      "offline-state",
      "offline-postcode",
      "offline-country",
      "offline-phone",
    ]) {
      expect(html, `missing field ${id}`).toContain(`id="${id}"`);
    }
    expect(html).toContain("Place order");
  });

  it("blocks submit when the cart needs shipping and no rate is selected", () => {
    const html = renderToStaticMarkup(
      <OfflinePaymentCheckout
        cart={cart({
          needsShipping: true,
          shippingRates: [
            {
              __typename: "ShippingPackage",
              packageId: "0",
              name: "Shipping",
              shippingRates: [
                {
                  __typename: "ShippingRate",
                  rateId: "flat_rate:1",
                  name: "Flat rate",
                  price: "10",
                  taxes: "0",
                  selected: false,
                },
              ],
            },
          ],
        } as Partial<CartFieldsFragment>)}
      />,
    );
    expect(html).toContain("Choose a delivery option");
    expect(html).toContain("disabled");
  });

  it("does not block a cart that needs no shipping", () => {
    const html = renderToStaticMarkup(
      <OfflinePaymentCheckout cart={cart({ needsShipping: false })} />,
    );
    expect(html).not.toContain("Choose a delivery option");
  });
});
