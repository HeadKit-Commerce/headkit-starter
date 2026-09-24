import { describe, expect, it } from "vitest";
import {
  INITIAL_PAYMENT_SELECTION,
  isExternalMethodSelected,
  isStripeMethodSelected,
  paymentSelectionReducer,
  primaryPaymentAction,
  selectedOfflineGatewayId,
  type PaymentSelectionState,
} from "./payment-method-selection";

/**
 * The selection state machine for the Payment step.
 *
 * WHAT THIS COVERS: every transition of the reducer across all THREE method
 * families (Stripe's Payment Element, PayPal, and the store's offline
 * gateways), in all six directions between them, and the derived "which single
 * action button is on screen" answer. It is the ONLY place the rule is
 * exercised by execution rather than by rendering.
 *
 * WHERE IT STOPS: it says nothing about the components. It cannot — vitest
 * runs `environment: "node"` here, so there is no DOM to click a row in and no
 * effect ever runs. That the Stripe step hides its `Pay` button, that the
 * PayPal row mounts its buttons and that the offline row shows a `Place order`
 * button for these states are MARKUP claims, asserted by server render in
 * `components/checkout/steps/payment-step-single-action.test.tsx`. That
 * `collapse()` leaves no Stripe row looking selected is neither — it is
 * Stripe's iframe, and only the browser evidence in the PR shows it.
 *
 * It also says nothing about WHICH offline gateways exist, or about the order
 * actually being placed: those are `lib/offline-gateway-details.test.ts` and
 * `lib/offline-order.test.ts`.
 */

const stripe = INITIAL_PAYMENT_SELECTION;
const paypal: PaymentSelectionState = {
  selection: "paypal",
  offlineGatewayId: null,
  externalBusy: false,
};
const offline: PaymentSelectionState = {
  selection: "offline",
  offlineGatewayId: "bacs",
  externalBusy: false,
};

describe("isStripeMethodSelected", () => {
  it("is true only for an EXPANDED Payment Element", () => {
    expect(isStripeMethodSelected({ collapsed: false })).toBe(true);
  });

  it("is false for the collapsed state our own collapse() produces", () => {
    // The whole reason the guard exists: picking one of our rows calls
    // collapse(), Stripe fires `change`, and treating that as a selection
    // would bounce the step straight back to Stripe with two actions
    // flickering.
    expect(isStripeMethodSelected({ collapsed: true })).toBe(false);
  });
});

describe("paymentSelectionReducer", () => {
  it("starts on Stripe's own default, with no offline gateway chosen", () => {
    expect(INITIAL_PAYMENT_SELECTION).toEqual({
      selection: "stripe",
      offlineGatewayId: null,
      externalBusy: false,
    });
  });

  it("moves between all three, in every direction", () => {
    const cases: Array<
      [
        PaymentSelectionState,
        Parameters<typeof paymentSelectionReducer>[1],
        PaymentSelectionState,
      ]
    > = [
      [stripe, { type: "paypal-selected" }, paypal],
      [stripe, { type: "offline-selected", gatewayId: "bacs" }, offline],
      [paypal, { type: "stripe-method-selected" }, stripe],
      [paypal, { type: "offline-selected", gatewayId: "bacs" }, offline],
      [offline, { type: "stripe-method-selected" }, stripe],
      [offline, { type: "paypal-selected" }, paypal],
    ];
    for (const [from, event, to] of cases) {
      expect(paymentSelectionReducer(from, event)).toEqual(to);
    }
  });

  it("keeps ONE offline gateway chosen when a store enables several", () => {
    // Two rows reading as selected at once is precisely what a second piece of
    // state for "which offline one" produces, so the id lives on the same
    // state as the selection.
    const cod = paymentSelectionReducer(offline, {
      type: "offline-selected",
      gatewayId: "cod",
    });
    expect(cod).toEqual({
      selection: "offline",
      offlineGatewayId: "cod",
      externalBusy: false,
    });
    expect(selectedOfflineGatewayId(cod)).toBe("cod");
  });

  it("forgets the offline gateway on the way out, so no row stays marked", () => {
    for (const event of [
      { type: "stripe-method-selected" },
      { type: "paypal-selected" },
    ] as const) {
      const next = paymentSelectionReducer(offline, event);
      expect(next.offlineGatewayId).toBeNull();
      expect(selectedOfflineGatewayId(next)).toBeNull();
    }
  });

  it("returns the SAME object when nothing changes", () => {
    // Identity matters: this value is a `useReducer` state, and a fresh object
    // per Payment Element `change` event would re-render the step on every
    // keystroke inside Stripe's card field.
    expect(
      paymentSelectionReducer(stripe, { type: "stripe-method-selected" }),
    ).toBe(stripe);
    expect(paymentSelectionReducer(paypal, { type: "paypal-selected" })).toBe(
      paypal,
    );
    expect(
      paymentSelectionReducer(offline, {
        type: "offline-selected",
        gatewayId: "bacs",
      }),
    ).toBe(offline);
  });

  it("pins the selection to whichever method went busy", () => {
    for (const method of ["paypal", "offline"] as const) {
      const busy = paymentSelectionReducer(
        method === "paypal" ? paypal : offline,
        { type: "external-busy-change", method, busy: true },
      );
      expect(busy.selection).toBe(method);
      expect(busy.externalBusy).toBe(true);

      // THE lock. A click on ANY other row mid-flight must not re-expose a
      // second action button — two payment paths runnable at once is the one
      // outcome this whole step is arranged to prevent.
      for (const event of [
        { type: "stripe-method-selected" },
        { type: "paypal-selected" },
        { type: "offline-selected", gatewayId: "cod" },
      ] as const) {
        expect(paymentSelectionReducer(busy, event)).toBe(busy);
      }
    }
  });

  it("releases the lock when the flow settles", () => {
    const busy: PaymentSelectionState = {
      selection: "offline",
      offlineGatewayId: "bacs",
      externalBusy: true,
    };
    const idle = paymentSelectionReducer(busy, {
      type: "external-busy-change",
      method: "offline",
      busy: false,
    });
    expect(idle).toEqual(offline);
    expect(
      paymentSelectionReducer(idle, { type: "stripe-method-selected" }),
    ).toEqual(stripe);
  });
});

describe("primaryPaymentAction", () => {
  it("names exactly one action per state, and never two", () => {
    expect(primaryPaymentAction(stripe)).toBe("stripe-pay-button");
    expect(primaryPaymentAction(paypal)).toBe("paypal-buttons");
    expect(primaryPaymentAction(offline)).toBe("offline-place-order-button");
    expect(primaryPaymentAction({ ...offline, externalBusy: true })).toBe(
      "offline-place-order-button",
    );
    expect(primaryPaymentAction({ ...paypal, externalBusy: true })).toBe(
      "paypal-buttons",
    );
  });
});

describe("isExternalMethodSelected", () => {
  it("is what tells the Stripe step to collapse and hide its Pay button", () => {
    expect(isExternalMethodSelected(stripe)).toBe(false);
    expect(isExternalMethodSelected(paypal)).toBe(true);
    expect(isExternalMethodSelected(offline)).toBe(true);
  });
});
