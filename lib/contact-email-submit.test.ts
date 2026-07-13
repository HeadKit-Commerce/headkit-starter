import { describe, expect, it } from "vitest";

import { decideContactSubmit } from "@/lib/contact-email-submit";

/**
 * ENG-801 quick-260714-7iq — decideContactSubmit.
 *
 * Pure extraction of the contact-step handleSubmit branch order, so the
 * session-email-wipe repair is unit-provable: toggling to the blank Stripe
 * ContactDetailsElement WIPES the Checkout Session email; when the shopper
 * toggles back and submits the UNCHANGED email, the submit path must observe
 * the wipe (empty session email) and choose "update-email" — not "advance".
 *
 * Pure/node-testable, mirroring lib/checkout-email.test.ts (the app has no
 * jsdom/testing-library setup — logic is extracted for the node vitest env).
 */

describe("decideContactSubmit (ENG-801)", () => {
  it('advances when the email is unchanged and the session already has it', () => {
    expect(
      decideContactSubmit({
        initialEmail: "a@x.com",
        submittedEmail: "a@x.com",
        sessionEmail: "a@x.com",
        hasRefreshSession: true,
      }),
    ).toBe("advance");
  });

  it('THE GAP — wipe roundtrip: unchanged email but the session email was wiped → "update-email"', () => {
    // Toggling to the blank ContactDetailsElement asserts empty onto the
    // session. Submit of the UNCHANGED email must repair it.
    expect(
      decideContactSubmit({
        initialEmail: "a@x.com",
        submittedEmail: "a@x.com",
        sessionEmail: "",
        hasRefreshSession: true,
      }),
    ).toBe("update-email");
  });

  it('recreates the session when the email changed and a refresh path exists', () => {
    expect(
      decideContactSubmit({
        initialEmail: "a@x.com",
        submittedEmail: "b@x.com",
        sessionEmail: "a@x.com",
        hasRefreshSession: true,
      }),
    ).toBe("recreate");
  });

  it('falls back to "update-email" when the email changed but no refresh path exists', () => {
    expect(
      decideContactSubmit({
        initialEmail: "a@x.com",
        submittedEmail: "b@x.com",
        sessionEmail: "a@x.com",
        hasRefreshSession: false,
      }),
    ).toBe("update-email");
  });

  it('first visit (no initial email) counts as changed → "recreate" when refresh exists (current behavior, preserved)', () => {
    expect(
      decideContactSubmit({
        initialEmail: "",
        submittedEmail: "b@x.com",
        sessionEmail: "",
        hasRefreshSession: true,
      }),
    ).toBe("recreate");
  });

  it("normalizes case and surrounding whitespace when comparing emails (treated as unchanged)", () => {
    expect(
      decideContactSubmit({
        initialEmail: "A@X.com ",
        submittedEmail: "a@x.com",
        sessionEmail: "a@x.com",
        hasRefreshSession: true,
      }),
    ).toBe("advance");
  });

  it('checkout state not success (sessionEmail null/undefined) with an unchanged prefill → "advance" (stripeHasNoEmail is false)', () => {
    expect(
      decideContactSubmit({
        initialEmail: "a@x.com",
        submittedEmail: "a@x.com",
        sessionEmail: null,
        hasRefreshSession: true,
      }),
    ).toBe("advance");
    expect(
      decideContactSubmit({
        initialEmail: "a@x.com",
        submittedEmail: "a@x.com",
        sessionEmail: undefined,
        hasRefreshSession: true,
      }),
    ).toBe("advance");
  });

  it('whitespace-only session email counts as wiped → "update-email"', () => {
    expect(
      decideContactSubmit({
        initialEmail: "a@x.com",
        submittedEmail: "a@x.com",
        sessionEmail: "   ",
        hasRefreshSession: true,
      }),
    ).toBe("update-email");
  });
});
