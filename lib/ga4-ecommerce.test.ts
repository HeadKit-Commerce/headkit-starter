import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  GA4_ECOMMERCE_EVENTS,
  buildAddToCart,
  buildAddToWishlist,
  buildBeginCheckout,
  buildPurchase,
  buildRemoveFromCart,
  buildSelectItem,
  buildViewCart,
  buildViewItem,
  buildViewItemList,
  ga4ItemsValue,
  ga4LineVariant,
  lineToGa4Item,
  productToGa4Item,
  pushGa4Ecommerce,
  pushGa4EcommerceOnce,
  type Ga4EcommerceEvent,
} from "@/lib/ga4-ecommerce";
import {
  CONTAINER_ALLOWED_ECOMMERCE_KEYS,
  CONTAINER_ALLOWED_ITEM_KEYS,
  CONTAINER_EVENT_NAMES,
  CONTAINER_REQUIRED_ECOMMERCE_KEYS,
  CONTAINER_REQUIRED_ITEM_KEYS,
} from "@/lib/__fixtures__/ga4-container-contract";

/**
 * The guard test for the GA4 ecommerce data layer.
 *
 * The failure it exists to catch is not a crash. Renaming `item_id`, or
 * emitting `order_complete` instead of `purchase`, produces a storefront that
 * works perfectly and reports nothing: GTM's triggers never match, and twelve
 * Google Ads conversion labels go quiet with no error anywhere. The only thing
 * that can notice is an assertion against a written-down copy of what the
 * container expects — `lib/__fixtures__/ga4-container-contract.ts`, whose
 * header carries the container audit this is derived from.
 *
 * So the assertions below are deliberately about NAMES and KEYS, not about
 * rendering. Every event this module can build is enumerated, and each one is
 * checked against the fixture: the event name is one the container triggers on,
 * the required `ecommerce` keys are present, every `items[]` entry carries the
 * four mandatory keys, and neither object carries a key outside its allowlist.
 */

const PRODUCT = {
  id: "1234",
  name: "2026 Scott Foil RC 10",
  sku: "SCOTT-FOIL-RC10",
  price: "8999.00",
  brands: [{ name: "Scott" }],
  categories: [{ name: "Bikes" }],
};

const CART_SOURCE = { totals: {} };

/** A 10 %-GST line: A$100.00 ex-tax with A$10.00 of sibling tax, two units. */
const TAXED_LINE = {
  id: "77",
  name: "Bib Shorts",
  sku: "BIB-01",
  quantity: 2,
  prices: { price: "55.00" },
  totals: {
    lineSubtotal: "100.00",
    lineSubtotalTax: "10.00",
    lineTotal: "100.00",
    lineTotalTax: "10.00",
  },
  variation: [
    { attribute: "Colour", value: "Carbon Black" },
    { attribute: "Size", value: "54" },
  ],
};

function sampleItem() {
  return productToGa4Item(PRODUCT, { price: 8999, quantity: 1 });
}

/** One instance of every event the module can build. */
const ALL_EVENTS: Ga4EcommerceEvent[] = [
  buildViewItem("AUD", sampleItem()),
  buildViewItemList("/collections/bikes", [
    productToGa4Item(PRODUCT, { index: 0, itemListName: "/collections/bikes" }),
  ]),
  buildSelectItem("/collections/bikes", sampleItem()),
  buildAddToCart("AUD", [sampleItem()]),
  buildRemoveFromCart("AUD", [sampleItem()]),
  buildViewCart("AUD", [sampleItem()], 8999),
  buildBeginCheckout("AUD", [sampleItem()], 8999, "WELCOME10"),
  buildPurchase({
    transactionId: "10421",
    currency: "AUD",
    value: 9098.9,
    tax: 827.17,
    shipping: 99.9,
    items: [sampleItem()],
    coupon: "WELCOME10",
  }),
  buildAddToWishlist("AUD", sampleItem()),
];

describe("GA4 event names match the GTM container", () => {
  it("emits exactly the names the container triggers on", () => {
    expect([...Object.values(GA4_ECOMMERCE_EVENTS)].sort()).toEqual(
      [...CONTAINER_EVENT_NAMES].sort(),
    );
  });

  it("covers every container event with a builder", () => {
    expect(ALL_EVENTS.map((e) => e.event).sort()).toEqual(
      [...CONTAINER_EVENT_NAMES].sort(),
    );
  });
});

describe("GA4 payload keys match the GTM container", () => {
  for (const event of ALL_EVENTS) {
    const required = CONTAINER_REQUIRED_ECOMMERCE_KEYS[event.event];

    it(`${event.event} carries every required ecommerce key`, () => {
      expect(required, `no fixture row for ${event.event}`).toBeDefined();
      for (const key of required ?? []) {
        expect(
          Object.keys(event.ecommerce),
          `${event.event} is missing ecommerce.${key}`,
        ).toContain(key);
      }
    });

    it(`${event.event} carries no unexpected ecommerce key`, () => {
      for (const key of Object.keys(event.ecommerce)) {
        expect(
          CONTAINER_ALLOWED_ECOMMERCE_KEYS as readonly string[],
          `${event.event} emits unknown ecommerce.${key}`,
        ).toContain(key);
      }
    });

    it(`${event.event} items carry the mandatory keys and nothing unknown`, () => {
      expect(event.ecommerce.items.length).toBeGreaterThan(0);
      for (const item of event.ecommerce.items) {
        for (const key of CONTAINER_REQUIRED_ITEM_KEYS) {
          expect(
            Object.keys(item),
            `${event.event} item is missing ${key}`,
          ).toContain(key);
        }
        for (const key of Object.keys(item)) {
          expect(
            CONTAINER_ALLOWED_ITEM_KEYS as readonly string[],
            `${event.event} item emits unknown ${key}`,
          ).toContain(key);
        }
      }
    });
  }

  it("purchase carries the three fields the Google Ads tags read", () => {
    const purchase = ALL_EVENTS.find((e) => e.event === "purchase");
    expect(purchase?.ecommerce.transaction_id).toBe("10421");
    expect(purchase?.ecommerce.currency).toBe("AUD");
    expect(purchase?.ecommerce.value).toBe(9098.9);
  });
});

describe("item mapping", () => {
  it("prefers the SKU as item_id and falls back to the id", () => {
    expect(productToGa4Item(PRODUCT).item_id).toBe("SCOTT-FOIL-RC10");
    expect(productToGa4Item({ ...PRODUCT, sku: "" }).item_id).toBe("1234");
    expect(productToGa4Item({ id: "9", name: "x" }).item_id).toBe("9");
  });

  it("omits brand, variant and category when the surface has none", () => {
    // A PLP card payload (`ProductSummaryFields`) carries no brands, categories
    // or SKU — the mapper must emit four keys, not four keys plus blanks.
    const item = productToGa4Item({ id: "9", name: "Cap", price: "25.00" });
    expect(Object.keys(item).sort()).toEqual([
      "item_id",
      "item_name",
      "price",
      "quantity",
    ]);
  });

  it("reports a line price PER UNIT and TAX-INCLUSIVE", () => {
    // A$100.00 ex-tax + A$10.00 tax over 2 units = A$55.00 each. Reading the
    // Store API total raw would report A$50.00 and under-state revenue by the
    // GST — the defect `lib/cart-prices.ts` exists to prevent.
    const item = lineToGa4Item(TAXED_LINE, CART_SOURCE, 0);
    expect(item.price).toBe(55);
    expect(item.quantity).toBe(2);
    expect(item.item_variant).toBe("Carbon Black / 54");
    expect(item.index).toBe(0);
  });

  it("reconciles price × quantity with the event value", () => {
    const items = [lineToGa4Item(TAXED_LINE, CART_SOURCE)];
    expect(ga4ItemsValue(items)).toBe(110);
    expect(buildAddToCart("AUD", items).ecommerce.value).toBe(110);
  });

  it("omits item_variant for an unvaried line", () => {
    expect(ga4LineVariant(null)).toBeUndefined();
    expect(ga4LineVariant([])).toBeUndefined();
    expect(
      lineToGa4Item({ ...TAXED_LINE, variation: [] }, CART_SOURCE),
    ).not.toHaveProperty("item_variant");
  });

  it("rounds money to cents", () => {
    const item = lineToGa4Item(
      {
        id: "1",
        name: "Third",
        quantity: 3,
        prices: { price: "0" },
        totals: { lineSubtotal: "10.00", lineSubtotalTax: "0" },
      },
      CART_SOURCE,
    );
    expect(item.price).toBe(3.33);
  });
});

describe("pushing into dataLayer", () => {
  const globalWithWindow = globalThis as { window?: unknown };

  beforeEach(() => {
    globalWithWindow.window = {
      dataLayer: undefined,
      sessionStorage: (() => {
        const store = new Map<string, string>();
        return {
          getItem: (k: string) => store.get(k) ?? null,
          setItem: (k: string, v: string) => void store.set(k, v),
        };
      })(),
    };
  });

  afterEach(() => {
    delete globalWithWindow.window;
  });

  it("resets ecommerce before every event so values cannot bleed", () => {
    // Google's own guidance: dataLayer entries merge, so without the null reset
    // the previous event's `items` survive into an event that omits them.
    pushGa4Ecommerce(buildViewItem("AUD", sampleItem()));
    const dataLayer = (globalWithWindow.window as { dataLayer: unknown[] })
      .dataLayer;
    expect(dataLayer).toHaveLength(2);
    expect(dataLayer[0]).toEqual({ ecommerce: null });
    expect((dataLayer[1] as Ga4EcommerceEvent).event).toBe("view_item");
  });

  it("creates dataLayer when GTM has not loaded yet", () => {
    // GTM is deferred to idle, so the first push routinely precedes gtm.js.
    pushGa4Ecommerce(buildViewItem("AUD", sampleItem()));
    expect(
      (globalWithWindow.window as { dataLayer: unknown[] }).dataLayer,
    ).toHaveLength(2);
  });

  it("is inert on the server", () => {
    delete globalWithWindow.window;
    expect(() =>
      pushGa4Ecommerce(buildViewItem("AUD", sampleItem())),
    ).not.toThrow();
  });

  it("pushes a deduped event exactly once", () => {
    const event = buildPurchase({
      transactionId: "10421",
      currency: "AUD",
      value: 100,
      tax: 9.09,
      shipping: 0,
      items: [sampleItem()],
    });
    expect(pushGa4EcommerceOnce("purchase_10421", event)).toBe(true);
    expect(pushGa4EcommerceOnce("purchase_10421", event)).toBe(false);
    expect(
      (globalWithWindow.window as { dataLayer: unknown[] }).dataLayer,
    ).toHaveLength(2);
  });

  it("still emits when sessionStorage throws", () => {
    // A browser with site data blocked throws on the accessor itself. A missing
    // conversion is worse than a duplicated one, so the guard fails open.
    (globalWithWindow.window as { sessionStorage: unknown }).sessionStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(
      pushGa4EcommerceOnce("purchase_1", buildViewItem("AUD", sampleItem())),
    ).toBe(true);
  });
});
