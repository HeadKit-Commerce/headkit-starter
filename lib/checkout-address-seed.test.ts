import { describe, expect, it } from "vitest";

import {
  buildStripeAddressSeed,
  type SavedShippingAddress,
} from "@/lib/checkout-address-seed";

/**
 * Layer 4b — buildStripeAddressSeed (CKA-04/CKA-05).
 *
 * On load the delivery step seeds the saved WP shipping/billing address into
 * the Stripe Checkout Session via the Sessions-native
 * updateShippingAddress/updateBillingAddress — NOT the create-only `contacts`
 * option (ENG-755). This pure helper builds that payload from the delivery-form
 * address (or returns null when there is nothing seedable, so the guest path
 * fires no update). The wiring/fire-once effect is covered by Plan 05 E2E; the
 * mapping branches (present/absent, ISO country, empty-field handling) are
 * unit-tested here in the node vitest env (the app has no jsdom setup —
 * mirrors lib/address-form.ts).
 */

const FULL: SavedShippingAddress = {
  firstName: "Ada",
  lastName: "Lovelace",
  line1: "1 Analytical Way",
  line2: "Unit 5",
  city: "Sydney",
  state: "NSW",
  country: "AU",
  postalCode: "2000",
  phone: "0400000000",
};

describe("buildStripeAddressSeed (CKA-04/CKA-05)", () => {
  it("returns null when no address is provided (guest — fires no seed)", () => {
    expect(buildStripeAddressSeed(null)).toBeNull();
    expect(buildStripeAddressSeed(undefined)).toBeNull();
    expect(buildStripeAddressSeed({})).toBeNull();
  });

  it("returns null when line1 is missing (nothing to seed)", () => {
    expect(buildStripeAddressSeed({ ...FULL, line1: "" })).toBeNull();
    expect(buildStripeAddressSeed({ ...FULL, line1: "   " })).toBeNull();
  });

  it("returns null when country is missing (Stripe requires a country)", () => {
    expect(buildStripeAddressSeed({ ...FULL, country: "" })).toBeNull();
    expect(buildStripeAddressSeed({ ...FULL, country: undefined })).toBeNull();
  });

  it("maps a full saved address to the Stripe seed payload (ISO country, postal_code)", () => {
    const seed = buildStripeAddressSeed(FULL);
    expect(seed).toEqual({
      name: "Ada Lovelace",
      address: {
        line1: "1 Analytical Way",
        line2: "Unit 5",
        city: "Sydney",
        state: "NSW",
        postal_code: "2000",
        country: "AU",
      },
    });
  });

  it("omits an empty line2 rather than sending an empty string", () => {
    const seed = buildStripeAddressSeed({ ...FULL, line2: "" });
    expect(seed?.address).not.toHaveProperty("line2");
  });

  it("builds the name from first+last, omitting the name key when both are empty", () => {
    const seed = buildStripeAddressSeed({
      ...FULL,
      firstName: "",
      lastName: "",
    });
    expect(seed).not.toHaveProperty("name");
    expect(seed?.address.line1).toBe("1 Analytical Way");
  });

  it("trims fields and tolerates missing city/state/postcode (default to empty)", () => {
    const seed = buildStripeAddressSeed({
      firstName: "  Grace  ",
      line1: "  10 Hopper St  ",
      country: "  NZ  ",
    });
    expect(seed).toEqual({
      name: "Grace",
      address: {
        line1: "10 Hopper St",
        city: "",
        state: "",
        postal_code: "",
        country: "NZ",
      },
    });
  });
});
