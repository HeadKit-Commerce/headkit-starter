import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * **The two merchant-authored strings an offline gateway row shows.**
 *
 * WHAT THIS COVERS: the whole of `lib/offline-gateway-details.ts` — which
 * gateways of a cart are offline, the title each row carries (the merchant's
 * own, falling back to WooCommerce's core label), the instructions the
 * selected row expands to, the malformed-env degradation, and the title match
 * the confirmation page makes against a PLACED order.
 *
 * WHERE IT STOPS: it drives the env var, because that is where the strings
 * come from TODAY. It therefore says nothing about the platform field that is
 * meant to replace it (`docs/tickets/offline-gateway-title-description.md`) —
 * when that lands, the resolver grows a source and this file grows cases for
 * it. It also says nothing about the row markup
 * (`components/checkout/steps/payment-step-single-action.test.tsx`) or about
 * whether a row is offered at all (`hasOfflineGatewayOption`, asserted in
 * `app/checkout/offline-gateway-absent.test.tsx`).
 */

const hoisted = vi.hoisted(() => ({
  env: {} as Record<string, string | undefined>,
}));

vi.mock("@/lib/env", () => ({
  get env() {
    return hoisted.env;
  },
}));

const {
  offlineInstructionsForOrderTitle,
  parseOfflineGatewayDetails,
  resolveOfflineGatewayOptions,
  resetOfflineGatewayDetailsCache,
} = await import("./offline-gateway-details");

const CART = ["headkit-payments", "bacs"];

function withEnv(value: string | undefined) {
  hoisted.env =
    value === undefined
      ? {}
      : {
          OFFLINE_PAYMENT_GATEWAY_DETAILS: value,
        };
  resetOfflineGatewayDetailsCache();
}

beforeEach(() => withEnv(undefined));

describe("parseOfflineGatewayDetails", () => {
  it("reads a title and a description per gateway id", () => {
    expect(
      parseOfflineGatewayDetails(
        '{"bacs":{"title":"Pay by bank","description":"Transfer to 12-3456."}}',
      ),
    ).toEqual({
      bacs: { title: "Pay by bank", description: "Transfer to 12-3456." },
    });
  });

  it("ignores entries with nothing usable in them", () => {
    expect(
      parseOfflineGatewayDetails(
        '{"bacs":{},"cod":null,"cheque":"nope","x":{"title":"  "}}',
      ),
    ).toEqual({});
  });

  it("degrades to nothing rather than throwing on malformed JSON", () => {
    // A store that mistypes its env var must still be able to sell.
    for (const raw of ["{", "[]", '"a string"', "  ", undefined]) {
      expect(parseOfflineGatewayDetails(raw)).toEqual({});
    }
  });
});

describe("resolveOfflineGatewayOptions", () => {
  it("uses the merchant's title and instructions when configured", () => {
    withEnv(
      '{"bacs":{"title":"Pay by bank","description":"Transfer to 12-3456."}}',
    );
    expect(resolveOfflineGatewayOptions(CART)).toEqual([
      { id: "bacs", title: "Pay by bank", description: "Transfer to 12-3456." },
    ]);
  });

  it("falls back to WooCommerce's core label, with no instructions", () => {
    expect(resolveOfflineGatewayOptions(CART)).toEqual([
      { id: "bacs", title: "Direct bank transfer", description: "" },
    ]);
  });

  it("carries a title-only configuration without inventing a description", () => {
    withEnv('{"bacs":{"title":"Pay by bank"}}');
    expect(resolveOfflineGatewayOptions(CART)).toEqual([
      { id: "bacs", title: "Pay by bank", description: "" },
    ]);
  });

  it("treats cheque and cod exactly the same — nothing is special-cased", () => {
    withEnv('{"cod":{"description":"Cash to the courier."}}');
    expect(
      resolveOfflineGatewayOptions(["headkit-payments", "cheque", "cod"]),
    ).toEqual([
      { id: "cheque", title: "Cheque payment", description: "" },
      {
        id: "cod",
        title: "Cash on delivery",
        description: "Cash to the courier.",
      },
    ]);
  });

  it("keeps an unknown gateway id, labelled by its id", () => {
    // A merchant's third-party offline plugin is still offline: dropping it
    // would silently remove a payment option the cart genuinely offers.
    expect(
      resolveOfflineGatewayOptions(["headkit-payments", "zip_pay"]),
    ).toEqual([{ id: "zip_pay", title: "zip_pay", description: "" }]);
  });

  it("preserves WooCommerce's own gateway order", () => {
    // Merchants control that order in WooCommerce; re-sorting here overrides a
    // decision they made deliberately.
    expect(
      resolveOfflineGatewayOptions(["cod", "headkit-payments", "bacs"]).map(
        (gateway) => gateway.id,
      ),
    ).toEqual(["cod", "bacs"]);
  });
});

describe("offlineInstructionsForOrderTitle", () => {
  it("matches a placed order by the title the shopper picked", () => {
    withEnv(
      '{"bacs":{"title":"Pay by bank","description":"Transfer to 12-3456."}}',
    );
    expect(offlineInstructionsForOrderTitle("Pay by bank")).toEqual({
      id: "bacs",
      title: "Pay by bank",
      description: "Transfer to 12-3456.",
    });
    // WooCommerce's own casing is not guaranteed to survive round trips.
    expect(offlineInstructionsForOrderTitle("  pay by bank ")?.id).toBe("bacs");
  });

  it("matches the core label when the merchant set no title", () => {
    withEnv('{"cod":{"description":"Cash to the courier."}}');
    expect(offlineInstructionsForOrderTitle("Cash on delivery")?.id).toBe(
      "cod",
    );
  });

  it("is null for a card or PayPal order, so no panel is drawn", () => {
    withEnv(
      '{"bacs":{"title":"Pay by bank","description":"Transfer to 12-3456."}}',
    );
    for (const title of [
      "Mastercard ending 4444",
      "PayPal",
      "",
      null,
      undefined,
    ]) {
      expect(offlineInstructionsForOrderTitle(title)).toBeNull();
    }
  });

  it("is null when the gateway carries no instructions to give", () => {
    // An empty panel is worse than none: it implies there is something to do
    // and does not say what.
    withEnv('{"bacs":{"title":"Pay by bank"}}');
    expect(offlineInstructionsForOrderTitle("Pay by bank")).toBeNull();
  });
});
