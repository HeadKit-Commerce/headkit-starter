"use server";

/**
 * Account server actions — thin wrappers around the HeadKit SDK auth domain.
 */

import { createClientSDK } from "@headkit/sdk";

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
        /^(login|registerCustomer|sendPasswordResetEmail|resetUserPassword|updateCustomerProfile|getCustomer):\s*/i,
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
