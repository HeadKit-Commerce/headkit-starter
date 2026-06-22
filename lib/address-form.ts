import { z } from "zod";

import type { AddressInput } from "@headkit/sdk";

/**
 * Address-book form contract (FE-04).
 *
 * Centralizes the zod validation schema and the form-values → SDK
 * `AddressInput` mapping so the address-book route reuses react-hook-form + zod
 * (no hand-rolled validation) and both pieces stay unit-testable in the node
 * vitest environment. The write is JWT-scoped server-side — these inputs never
 * carry a customer id (IDOR-safe, T-03-AB1).
 */

const addressSchema = z.object({
  firstName: z.string().min(1, "First name is required"),
  lastName: z.string().min(1, "Last name is required"),
  company: z.string(),
  address1: z.string().min(1, "Street address is required"),
  address2: z.string(),
  city: z.string().min(1, "City is required"),
  state: z.string(),
  postcode: z.string().min(1, "Postcode is required"),
  country: z.string().min(1, "Country is required"),
  // Optional contact fields — empty is allowed; if present, email must be valid.
  email: z.union([z.literal(""), z.string().email("Invalid email")]),
  phone: z.string(),
});

export const addressFormSchema = z.object({
  billing: addressSchema,
  shipping: addressSchema,
});

export type AddressFieldValues = z.infer<typeof addressSchema>;
export type AddressFormValues = z.infer<typeof addressFormSchema>;

const emptyAddress: AddressFieldValues = {
  firstName: "",
  lastName: "",
  company: "",
  address1: "",
  address2: "",
  city: "",
  state: "",
  postcode: "",
  country: "",
  email: "",
  phone: "",
};

export const emptyAddressForm: AddressFormValues = {
  billing: { ...emptyAddress },
  shipping: { ...emptyAddress },
};

/**
 * Map validated form values to the SDK `AddressInput`. Omits an empty optional
 * email so we never forward an empty string for a nullable contact field. No
 * customer id is ever included — the server scopes the write to the JWT.
 */
export function toAddressInput(values: AddressFieldValues): AddressInput {
  const input: AddressInput = {
    firstName: values.firstName,
    lastName: values.lastName,
    address1: values.address1,
    address2: values.address2,
    city: values.city,
    state: values.state,
    postcode: values.postcode,
    country: values.country,
    phone: values.phone,
  };
  if (values.email) input.email = values.email;
  return input;
}
