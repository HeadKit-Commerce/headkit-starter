import { describe, expect, it } from "vitest";

import { decideContactSubmit } from "@/lib/contact-email-submit";

/**
 * ENG-801 quick-260714-n0w — decideContactSubmit.
 *
 * Pure extraction of the contact-step handleSubmit branch order. The Stripe
 * path renders the ContactDetailsElement single-mode with a PROVIDER-level
 * prefill (CheckoutElementsProvider options.defaultValues.email); sessions
 * are created email-LESS, so a session's email can still be empty at submit
 * time (async-arriving prefill missed by provider defaultValues, or the
 * bounded push not yet landed). Submitting an UNCHANGED prefill against such
 * a session must choose "update-email" — not "advance".
 *
 * Pure/node-testable, mirroring lib/checkout-email.test.ts (the app has no
 * jsdom/testing-library setup — logic is extracted for the node vitest env).
 */

describe("decideContactSubmit (ENG-801)", () => {
  it("advances when the email is unchanged and the session already has it", () => {
    expect(
      decideContactSubmit({
        initialEmail: "a@x.com",
        submittedEmail: "a@x.com",
        sessionEmail: "a@x.com",
        hasRefreshSession: true,
      }),
    ).toBe("advance");
  });

  it('THE GAP — session email empty at submit despite an unchanged prefill → "update-email"', () => {
    // Sessions are created email-LESS; if neither the provider defaultValues
    // prefill nor the bounded push has landed the email on the session yet,
    // the unchanged-prefill submit must repair it rather than advance.
    expect(
      decideContactSubmit({
        initialEmail: "a@x.com",
        submittedEmail: "a@x.com",
        sessionEmail: "",
        hasRefreshSession: true,
      }),
    ).toBe("update-email");
  });

  it("recreates the session when the email changed and a refresh path exists", () => {
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
