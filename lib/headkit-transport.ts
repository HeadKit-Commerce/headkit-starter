import {
  HEADKIT_GRAPHQL_URL,
  type TransportOptions,
} from "@headkit/sdk";
import { env } from "@/lib/env";

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
 */
export function headkitTransportOpts(): TransportOptions {
  return buildHeadkitTransportOpts({
    url: env.NEXT_PUBLIC_GRAPHQL_URL ?? HEADKIT_GRAPHQL_URL,
    publicKey: env.NEXT_PUBLIC_HEADKIT_PUBLIC_KEY,
    // Server schema requires this; client bundle never calls this helper.
    secretKey: env.HEADKIT_PRIVATE_KEY ?? "",
  });
}
