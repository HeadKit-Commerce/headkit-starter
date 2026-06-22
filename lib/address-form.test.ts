import { describe, expect, it } from "vitest";

import {
  addressFormSchema,
  emptyAddressForm,
  toAddressInput,
  type AddressFormValues,
} from "@/lib/address-form";

/**
 * Address-book form contract (FE-04).
 *
 * The address-book route reuses react-hook-form + zod (no hand-rolled
 * validation — prohibition). The validation schema and the
 * form-values → SDK `AddressInput` mapping are extracted here so they are
 * unit-testable in the existing node vitest environment (the app has no
 * jsdom/testing-library setup). The page imports these directly.
 */

const VALID: AddressFormValues = {
  billing: {
    firstName: "Ada",
    lastName: "Lovelace",
    company: "",
    address1: "1 Analytical Way",
    address2: "",
    city: "Bangkok",
    state: "",
    postcode: "10110",
    country: "TH",
    email: "ada@example.com",
    phone: "0800000000",
  },
  shipping: {
    firstName: "Ada",
    lastName: "Lovelace",
    company: "",
    address1: "1 Analytical Way",
    address2: "",
    city: "Bangkok",
    state: "",
    postcode: "10110",
    country: "TH",
    email: "ada@example.com",
    phone: "0800000000",
  },
};

describe("addressFormSchema (FE-04 zod validation)", () => {
  it("accepts a fully populated billing + shipping address", () => {
    const parsed = addressFormSchema.safeParse(VALID);
    expect(parsed.success).toBe(true);
  });

  it("requires billing first/last name, address1, city, postcode, country", () => {
    const parsed = addressFormSchema.safeParse({
      ...VALID,
      billing: { ...VALID.billing, firstName: "", address1: "", city: "" },
    });
    expect(parsed.success).toBe(false);
  });

  it("rejects a malformed email", () => {
    const parsed = addressFormSchema.safeParse({
      ...VALID,
      billing: { ...VALID.billing, email: "not-an-email" },
    });
    expect(parsed.success).toBe(false);
  });

  it("allows an empty email (optional contact field)", () => {
    const parsed = addressFormSchema.safeParse({
      ...VALID,
      billing: { ...VALID.billing, email: "" },
    });
    expect(parsed.success).toBe(true);
  });

  it("exposes a default empty form value for RHF reset", () => {
    expect(emptyAddressForm.billing.firstName).toBe("");
    expect(emptyAddressForm.shipping.country).toBe("");
  });
});

describe("toAddressInput (form → SDK AddressInput mapping)", () => {
  it("maps every editable form field to the SDK input", () => {
    const input = toAddressInput(VALID.billing);
    expect(input).toMatchObject({
      firstName: "Ada",
      lastName: "Lovelace",
      address1: "1 Analytical Way",
      city: "Bangkok",
      postcode: "10110",
      country: "TH",
      email: "ada@example.com",
      phone: "0800000000",
    });
  });

  it("omits an empty optional email rather than sending an empty string", () => {
    const input = toAddressInput({ ...VALID.billing, email: "" });
    expect(input.email).toBeUndefined();
  });

  it("never includes a customer id (IDOR-safe — JWT scopes the write)", () => {
    const input = toAddressInput(VALID.billing) as Record<string, unknown>;
    expect("customerId" in input).toBe(false);
    expect("customer_id" in input).toBe(false);
    expect("id" in input).toBe(false);
  });
});
