import { HEADKIT_GRAPHQL_URL, type TransportOptions } from "@headkit/sdk";

/**
 * Build GraphQL transport options from explicit keys.
 *
 * `x-headkit-key` MUST be the store PUBLIC key — commerce resolves stores by
 * public key only (`FindByKey`). Sending `HEADKIT_PRIVATE_KEY` (sk_) as
 * `apiKey` causes INTERNAL_SERVER_ERROR on every request (live Paralel GF
 * Contact/Enquire 500s). The secret is optional and goes in `secretKey`
 * (`x-headkit-secret-key`) for privileged ops — same contract as ServerSDK.
 */
export function buildHeadkitTransportOpts(input: {
  url: string;
  publicKey: string;
  secretKey: string;
}): TransportOptions {
  const { url, publicKey, secretKey } = input;
  return {
    url,
    apiKey: publicKey,
    ...(secretKey && secretKey !== publicKey ? { secretKey } : {}),
  };
}

/**
 * GraphQL transport options for ad-hoc `executeRequest` calls in server
 * actions / route handlers. See {@link buildHeadkitTransportOpts}.
 *
 * Env is loaded inside the function so unit tests of
 * {@link buildHeadkitTransportOpts} do not require validated process.env.
 */
export function headkitTransportOpts(): TransportOptions {
  // Deferred import: top-level `env` parse fails in CI when Vitest files that
  // only exercise the pure builder are collected without a .env.
  const { env } = requireEnv();
  return buildHeadkitTransportOpts({
    url: env.NEXT_PUBLIC_GRAPHQL_URL ?? HEADKIT_GRAPHQL_URL,
    publicKey: env.NEXT_PUBLIC_HEADKIT_PUBLIC_KEY,
    // Server schema requires this; client bundle never calls this helper.
    secretKey: env.HEADKIT_PRIVATE_KEY ?? "",
  });
}

function requireEnv(): typeof import("@/lib/env") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- sync lazy load
  return require("@/lib/env") as typeof import("@/lib/env");
}
