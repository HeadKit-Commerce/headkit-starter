"use server";

/**
 * Account server actions — thin wrappers around the HeadKit SDK auth domain.
 */

import { createClientSDK, type AddressInput } from "@headkit/sdk";

import { env } from "./env";

// Canonical gateway URL (FE-11) — single source of truth from the validated
// env schema. The previous divergent fallback chain (server-only var,
// public alias, and a hardcoded localhost gateway) has been removed.
const GQL_URL = env.NEXT_PUBLIC_GRAPHQL_URL;

const PUBLIC_KEY = process.env.NEXT_PUBLIC_HEADKIT_PUBLIC_KEY ?? "";

/**
 * Extract user-facing error message from thrown error.
 * Strips GraphQL/resolver operation prefixes (e.g. "registerCustomer: ") for cleaner display.
 */
function getErrorMessage(err: unknown, fallback: string): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg || msg === "[object Object]") return fallback;
  return (
    msg
      .replace(
        /^(login|registerCustomer|sendPasswordResetEmail|resetUserPassword|updateCustomerProfile|getCustomer|updateCustomerAddress):\s*/i,
        "",
      )
      .trim() || fallback
  );
}

function getSDK() {
  return createClientSDK({
    publicKey: PUBLIC_KEY,
    url: GQL_URL,
  });
}

// ---------------------------------------------------------------------------

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

export interface AuthData {
  token: string;
  /**
   * Refresh token (FE-05) returned alongside the JWT. Surfaced so the auth
   * context can store it and silently refresh the session before expiry.
   */
  refreshToken: string;
  userId: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

export async function login(
  email: string,
  password: string,
): Promise<ActionResult<AuthData>> {
  try {
    const sdk = getSDK();
    const result = await sdk.auth.login({
      username: email,
      password,
    });

    return {
      success: true,
      data: {
        token: result.authToken,
        refreshToken: result.refreshToken,
        userId: result.user?.id ?? "",
        email: result.user?.email ?? email,
        firstName: result.user?.firstName ?? null,
        lastName: result.user?.lastName ?? null,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err, "Invalid email or password"),
    };
  }
}

export async function registerUser(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<ActionResult<AuthData>> {
  try {
    const sdk = getSDK();
    const result = await sdk.auth.register({
      email: input.email,
      password: input.password,
      firstName: input.firstName,
      lastName: input.lastName,
    });

    return {
      success: true,
      data: {
        token: result.authToken,
        refreshToken: result.refreshToken,
        userId: result.customer?.id ?? "",
        email: result.customer?.email ?? input.email,
        firstName: result.customer?.firstName ?? null,
        lastName: result.customer?.lastName ?? null,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(
        err,
        "Failed to create account. Please try again.",
      ),
    };
  }
}

export async function sendPasswordResetEmail(
  email: string,
): Promise<ActionResult> {
  try {
    const sdk = getSDK();
    const success = await sdk.auth.sendPasswordResetEmail({ username: email });
    if (!success) {
      return {
        success: false,
        error: "Failed to send reset email. Please try again.",
      };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(
        err,
        "Failed to send reset email. Please try again.",
      ),
    };
  }
}

export async function resetUserPassword(input: {
  key: string;
  login: string;
  password: string;
}): Promise<ActionResult> {
  try {
    const sdk = getSDK();
    const success = await sdk.auth.resetPassword(input);
    if (!success) {
      return {
        success: false,
        error: "Failed to reset password. Please try again.",
      };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(
        err,
        "Failed to reset password. Please try again.",
      ),
    };
  }
}

export async function getCustomer(authToken: string): Promise<
  ActionResult<{
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  }>
> {
  try {
    const sdk = getSDK();
    const customer = await sdk.auth.getCustomer(authToken);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }
    return {
      success: true,
      data: {
        id: customer.id,
        email: customer.email ?? "",
        firstName: customer.firstName ?? null,
        lastName: customer.lastName ?? null,
      },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(err, "Failed to load customer data"),
    };
  }
}

export async function updateCustomer(
  authToken: string,
  input: { firstName: string; lastName: string; email: string },
): Promise<ActionResult<typeof input>> {
  try {
    const sdk = getSDK();
    await sdk.auth.updateProfile(authToken, input);
    return { success: true, data: input };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(
        err,
        "Failed to update profile. Please try again.",
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// FE-04 — address book
//
// Both actions are scoped ONLY by the authenticated customer's JWT (authToken).
// They never accept or forward a client-supplied customer id — the commerce
// resolver derives the customer from the validated token (Phase-2 IDOR-safe
// path; threat T-03-AB1). The shape returned to the client is normalized to a
// safe subset; failures return the UI-SPEC generic error (no raw error/stack).

/** Editable address fields surfaced in the address book (read + write). */
export interface AddressData {
  firstName: string;
  lastName: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email: string;
  phone: string;
}

export interface CustomerAddresses {
  billing: AddressData;
  shipping: AddressData;
  /** Whether the customer has any saved address (drives the empty state). */
  hasAddress: boolean;
}

const EMPTY_ADDRESS: AddressData = {
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

/** Normalize a nullable SDK Address into the form-friendly AddressData shape. */
function toAddressData(
  addr:
    | {
        firstName?: string | null;
        lastName?: string | null;
        company?: string | null;
        address1?: string | null;
        address2?: string | null;
        city?: string | null;
        state?: string | null;
        postcode?: string | null;
        country?: string | null;
        email?: string | null;
        phone?: string | null;
      }
    | null
    | undefined,
): AddressData {
  if (!addr) return { ...EMPTY_ADDRESS };
  return {
    firstName: addr.firstName ?? "",
    lastName: addr.lastName ?? "",
    company: addr.company ?? "",
    address1: addr.address1 ?? "",
    address2: addr.address2 ?? "",
    city: addr.city ?? "",
    state: addr.state ?? "",
    postcode: addr.postcode ?? "",
    country: addr.country ?? "",
    email: addr.email ?? "",
    phone: addr.phone ?? "",
  };
}

/** True if any meaningful address field is populated. */
function isAddressPopulated(a: AddressData): boolean {
  return Boolean(
    a.firstName ||
    a.lastName ||
    a.address1 ||
    a.city ||
    a.postcode ||
    a.country,
  );
}

/**
 * Read the authenticated customer's billing + shipping addresses (FE-04).
 * JWT-scoped only — no client-supplied customer id (IDOR-safe, T-03-AB1).
 */
export async function getAddresses(
  authToken: string,
): Promise<ActionResult<CustomerAddresses>> {
  try {
    const sdk = getSDK();
    const customer = await sdk.auth.getCustomer(authToken);
    if (!customer) {
      return { success: false, error: "Customer not found" };
    }
    const billing = toAddressData(customer.billingAddress);
    const shipping = toAddressData(customer.shippingAddress);
    return {
      success: true,
      data: {
        billing,
        shipping,
        hasAddress: isAddressPopulated(billing) || isAddressPopulated(shipping),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(
        err,
        "We couldn't load this right now. Refresh the page, or try again in a moment.",
      ),
    };
  }
}

/**
 * Update the authenticated customer's billing and/or shipping address (FE-04).
 * JWT-scoped only — no client-supplied customer id (IDOR-safe, T-03-AB1). The
 * commerce mutation re-validates the typed AddressInput server-side.
 */
export async function updateAddress(
  authToken: string,
  input: { billing?: AddressInput; shipping?: AddressInput },
): Promise<ActionResult<CustomerAddresses>> {
  try {
    const sdk = getSDK();
    const variables: { billing?: AddressInput; shipping?: AddressInput } = {};
    if (input.billing !== undefined) variables.billing = input.billing;
    if (input.shipping !== undefined) variables.shipping = input.shipping;
    const customer = await sdk.auth.updateAddress(authToken, variables);
    const billing = toAddressData(customer.billingAddress);
    const shipping = toAddressData(customer.shippingAddress);
    return {
      success: true,
      data: {
        billing,
        shipping,
        hasAddress: isAddressPopulated(billing) || isAddressPopulated(shipping),
      },
    };
  } catch (err) {
    return {
      success: false,
      error: getErrorMessage(
        err,
        "We couldn't save your address right now. Please try again in a moment.",
      ),
    };
  }
}
