/**
 * Which payment method the Payment step is offering to
 * charge, as ONE value.
 *
 * ---------------------------------------------------------------------------
 * Why a reducer, and why it is the only place the rule lives
 * ---------------------------------------------------------------------------
 * The Payment step draws three things that each believe they own the
 * selection: Stripe's Payment Element (an accordion of rows, in an iframe,
 * whose radio state we can READ through `onChange` but never WRITE), this
 * store's PayPal row, and its offline-gateway rows (bank transfer / cheque /
 * cash on delivery — shown under whatever title the merchant gave them). The
 * last two are ours, and writable. Keeping all of them consistent is a state
 * machine, and it is one the unit suite can exercise directly — the suite
 * renders server-side with no DOM (`vitest.config.ts` is `environment:
 * "node"`), so a click-driven test of the same rule is impossible. Everything
 * that decides which action button the shopper sees is therefore in these
 * functions, and the components only render what the reducer already decided.
 *
 * The directions are NOT symmetric, and that asymmetry is the whole design:
 *
 * - anything → Stripe is driven by Stripe itself. Picking any row inside the
 *   Payment Element fires `change` with `collapsed: false`, which is the only
 *   honest signal that a Stripe method is now selected.
 * - Stripe → ours cannot be pushed into the iframe. The step calls
 *   `paymentElement.collapse()` instead, which returns the Element to its
 *   row-of-tabs state with nothing expanded — so exactly one row reads as
 *   selected across the whole step, which is the requirement.
 * - ours → ours is a plain state write; only one of our rows can carry
 *   `aria-checked="true"`, and {@link selectedOfflineGatewayId} is what the
 *   offline rows read to decide which of THEM is the chosen one.
 *
 * `externalBusy` is the lock that keeps two payment paths from ever being
 * runnable at once from the other side: while PayPal's capture or an offline
 * place-order is in flight, a stray click on a Stripe row (or on the other
 * external row) must not flip the step back and re-expose another action
 * button. (The Stripe side of that lock is the mirror image: our rows are
 * `disabled` while `checkout.confirm()` is in flight.)
 */

/** The method families the step can be offering. */
export type PaymentMethodSelection = "stripe" | "paypal" | "offline";

/** The two selections this store owns — the ones that can go busy. */
export type ExternalPaymentMethod = Exclude<PaymentMethodSelection, "stripe">;

export interface PaymentSelectionState {
  selection: PaymentMethodSelection;
  /**
   * Which offline gateway id is chosen, when `selection` is "offline".
   *
   * Kept on the SAME state as the selection rather than beside it: a store can
   * enable bacs AND cod, and a second piece of state for "which one" is how
   * two rows end up reading as selected at once.
   */
  offlineGatewayId: string | null;
  /** True from an external method's start until it settles or fails. */
  externalBusy: boolean;
}

export type PaymentSelectionEvent =
  /** A row inside Stripe's Payment Element was expanded — i.e. selected. */
  | { type: "stripe-method-selected" }
  /** The shopper clicked this store's PayPal row. */
  | { type: "paypal-selected" }
  /** The shopper clicked one of this store's offline-gateway rows. */
  | { type: "offline-selected"; gatewayId: string }
  /** An external method's own flow started / finished (success, failure, cancel). */
  | {
      type: "external-busy-change";
      method: ExternalPaymentMethod;
      busy: boolean;
    };

/** The step opens on Stripe's own default (card) — see the PR note. */
export const INITIAL_PAYMENT_SELECTION: PaymentSelectionState = {
  selection: "stripe",
  offlineGatewayId: null,
  externalBusy: false,
};

/**
 * Whether a Payment Element `change` event means a Stripe method is selected.
 *
 * `collapsed: true` is the state `collapse()` leaves behind — including the
 * `change` event our own `collapse()` call triggers when one of our rows is
 * picked, so treating it as a selection would make the step flip straight back
 * to Stripe.
 */
export function isStripeMethodSelected(event: { collapsed: boolean }): boolean {
  return !event.collapsed;
}

export function paymentSelectionReducer(
  state: PaymentSelectionState,
  event: PaymentSelectionEvent,
): PaymentSelectionState {
  switch (event.type) {
    case "stripe-method-selected":
      if (state.externalBusy) return state;
      if (state.selection === "stripe") return state;
      return { ...state, selection: "stripe", offlineGatewayId: null };
    case "paypal-selected":
      if (state.externalBusy) return state;
      if (state.selection === "paypal") return state;
      return { ...state, selection: "paypal", offlineGatewayId: null };
    case "offline-selected":
      if (state.externalBusy) return state;
      if (
        state.selection === "offline" &&
        state.offlineGatewayId === event.gatewayId
      ) {
        return state;
      }
      return {
        ...state,
        selection: "offline",
        offlineGatewayId: event.gatewayId,
      };
    case "external-busy-change":
      if (state.externalBusy === event.busy) return state;
      // Going busy also pins the selection: the in-flight payment belongs to
      // the method that started it, whatever the shopper clicks next.
      return event.busy
        ? { ...state, selection: event.method, externalBusy: true }
        : { ...state, externalBusy: false };
  }
}

/** True while a method OUTSIDE Stripe's Payment Element owns the step. */
export function isExternalMethodSelected(
  state: PaymentSelectionState,
): boolean {
  return state.selection !== "stripe";
}

/** The offline gateway the shopper picked, or null when none is selected. */
export function selectedOfflineGatewayId(
  state: PaymentSelectionState,
): string | null {
  return state.selection === "offline" ? state.offlineGatewayId : null;
}

/**
 * The single primary action the step renders.
 *
 * There is never a fourth answer and never two at once — that is the
 * acceptance criterion this function exists to make checkable.
 */
export function primaryPaymentAction(
  state: PaymentSelectionState,
): "stripe-pay-button" | "paypal-buttons" | "offline-place-order-button" {
  switch (state.selection) {
    case "paypal":
      return "paypal-buttons";
    case "offline":
      return "offline-place-order-button";
    case "stripe":
      return "stripe-pay-button";
  }
}
