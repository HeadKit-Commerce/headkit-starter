import { describe, expect, it } from "vitest";

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  buildCheckoutBillingAddressElementOptions,
  buildCheckoutShippingAddressElementOptions,
  buildCheckoutShippingContacts,
  buildStripeAddressSeed,
  contactsWithoutPhone,
  savedShippingFromAddressInput,
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

describe("buildCheckoutShippingAddressElementOptions", () => {
  it("returns empty object when there are no contacts (guest)", () => {
    expect(buildCheckoutShippingAddressElementOptions(undefined)).toEqual({});
    expect(buildCheckoutShippingAddressElementOptions([])).toEqual({});
  });

  it("passes contacts only — never fields (Checkout Session create contract)", () => {
    const contacts = [
      {
        name: "Ada Lovelace",
        address: {
          line1: "1 Analytical Way",
          city: "Sydney",
          state: "NSW",
          postal_code: "2000",
          country: "AU",
        },
      },
    ];
    const options = buildCheckoutShippingAddressElementOptions(contacts);
    expect(options).toEqual({ contacts });
    expect(options).not.toHaveProperty("fields");
    expect(JSON.stringify(options)).not.toContain('"fields"');
  });
});

describe("buildCheckoutShippingContacts", () => {
  it("returns undefined when there is no seedable address", () => {
    expect(buildCheckoutShippingContacts(null)).toBeUndefined();
    expect(buildCheckoutShippingContacts({})).toBeUndefined();
  });

  it("never puts phone on contacts even when the saved address has one", () => {
    const contacts = buildCheckoutShippingContacts(FULL);
    expect(contacts).toEqual([
      {
        name: "Ada Lovelace",
        address: {
          line1: "1 Analytical Way",
          line2: "Unit 5",
          city: "Sydney",
          state: "NSW",
          postal_code: "2000",
          country: "AU",
        },
      },
    ]);
    expect(contacts?.[0]).not.toHaveProperty("phone");
    expect(JSON.stringify(contacts)).not.toContain("phone");
  });
});

describe("contactsWithoutPhone", () => {
  it("strips phone from a contact that carried one", () => {
    const stripped = contactsWithoutPhone([
      {
        name: "Ada Lovelace",
        address: {
          line1: "1 Analytical Way",
          city: "Sydney",
          state: "NSW",
          postal_code: "2000",
          country: "AU",
        },
        phone: "0400000000",
      },
    ]);
    expect(stripped?.[0]).not.toHaveProperty("phone");
    expect(JSON.stringify(stripped)).not.toContain("phone");
  });
});

describe("buildCheckoutBillingAddressElementOptions", () => {
  const shippingWithPhone = {
    firstName: "Ada",
    lastName: "Lovelace",
    address1: "1 Analytical Way",
    address2: "Unit 5",
    city: "Sydney",
    state: "NSW",
    postcode: "2000",
    country: "AU",
    phone: "0400000000",
  };

  it("seeds billing contacts from shipping address without phone", () => {
    const options = buildCheckoutBillingAddressElementOptions({
      shippingAddress: shippingWithPhone,
    });
    expect(options).toEqual({
      contacts: [
        {
          name: "Ada Lovelace",
          address: {
            line1: "1 Analytical Way",
            line2: "Unit 5",
            city: "Sydney",
            state: "NSW",
            postal_code: "2000",
            country: "AU",
          },
        },
      ],
    });
    expect(JSON.stringify(options)).not.toContain("phone");
    expect(options).not.toHaveProperty("fields");
  });

  it("prefers remount contacts and still strips phone", () => {
    const options = buildCheckoutBillingAddressElementOptions({
      remountContacts: [
        {
          name: "Grace Hopper",
          address: {
            line1: "10 Hopper St",
            city: "Auckland",
            state: "AUK",
            postal_code: "1010",
            country: "NZ",
          },
          phone: "+64211234567",
        },
      ],
      shippingAddress: shippingWithPhone,
    });
    expect(options).toEqual({
      contacts: [
        {
          name: "Grace Hopper",
          address: {
            line1: "10 Hopper St",
            city: "Auckland",
            state: "AUK",
            postal_code: "1010",
            country: "NZ",
          },
        },
      ],
    });
    expect(JSON.stringify(options)).not.toContain("phone");
  });

  it("returns empty options when there is nothing to seed (guest)", () => {
    expect(buildCheckoutBillingAddressElementOptions({})).toEqual({});
    expect(
      buildCheckoutBillingAddressElementOptions({ shippingAddress: null }),
    ).toEqual({});
  });

  it("maps AddressInput-shaped shipping onto the seed without phone", () => {
    expect(savedShippingFromAddressInput(shippingWithPhone)).toEqual({
      firstName: "Ada",
      lastName: "Lovelace",
      line1: "1 Analytical Way",
      line2: "Unit 5",
      city: "Sydney",
      state: "NSW",
      country: "AU",
      postalCode: "2000",
    });
  });
});

describe("ShippingAddressElement options source-scan", () => {
  it("delivery step never passes AddressElement fields to ShippingAddressElement", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../components/checkout/steps/delivery-method-step.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("buildCheckoutShippingAddressElementOptions");
    expect(source).toContain("options={stripeShippingOptions}");
    expect(source).toContain("<PhoneInput");
    expect(source).toContain("updatePhoneNumber");
    expect(source).not.toMatch(
      /<ShippingAddressElement[\s\S]{0,800}fields\s*[:=]/,
    );
  });

  it("helper source never mentions AddressElement fields as an accepted option", () => {
    const source = readFileSync(
      resolve(__dirname, "./checkout-address-seed.ts"),
      "utf8",
    );
    expect(source).toMatch(/Do NOT pass AddressElement `fields`/);
    expect(source).not.toMatch(/fields:\s*\{\s*phone/);
    expect(source).not.toMatch(
      /return\s*\[[\s\S]{0,200}\.\.\.\(phone \? \{ phone \}/,
    );
  });

  it("payment step never passes contacts[].phone or AddressElement phone fields", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../components/checkout/steps/stripe-checkout-step.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("buildCheckoutBillingAddressElementOptions");
    expect(source).not.toMatch(
      /<BillingAddressElement[\s\S]{0,800}fields\s*[:=]/,
    );
    expect(source).not.toMatch(/contacts:\s*\[[\s\S]{0,200}phone/);
  });

  it("click-and-collect billing step never puts phone on contacts", () => {
    const source = readFileSync(
      resolve(
        __dirname,
        "../components/checkout/steps/billing-address-step.tsx",
      ),
      "utf8",
    );
    expect(source).toContain("buildCheckoutShippingAddressElementOptions");
    expect(source).not.toMatch(
      /<BillingAddressElement[\s\S]{0,800}fields\s*[:=]/,
    );
  });
});
