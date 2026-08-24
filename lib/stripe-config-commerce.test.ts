import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/headkit-transport", () => ({
  headkitTransportOpts: (): { url: string; apiKey: string } => ({
    url: "https://graph.example.test/graphql",
    apiKey: "pk_store",
  }),
}));

import { mapCommerceStripeConfigResponse } from "./stripe-config-commerce";

describe("mapCommerceStripeConfigResponse", () => {
  it("maps a complete commerce payload", () => {
    expect(
      mapCommerceStripeConfigResponse({
        commerce: {
          stripeConfig: {
            publishableKey: "pk_test_1",
            stripeAccountId: "acct_1",
            testMode: true,
            bnplMessagingEnabled: true,
          },
        },
      }),
    ).toEqual({
      publishableKey: "pk_test_1",
      accountId: "acct_1",
      bnplMessagingEnabled: true,
    });
  });

  it("treats a missing Connect account as empty, not a miss", () => {
    expect(
      mapCommerceStripeConfigResponse({
        commerce: {
          stripeConfig: {
            publishableKey: "pk_test_1",
            stripeAccountId: "",
            bnplMessagingEnabled: false,
          },
        },
      }),
    ).toEqual({
      publishableKey: "pk_test_1",
      accountId: "",
      bnplMessagingEnabled: false,
    });
  });

  it("returns null for unknown-field / empty data", () => {
    expect(mapCommerceStripeConfigResponse(null)).toBeNull();
    expect(mapCommerceStripeConfigResponse({})).toBeNull();
    expect(
      mapCommerceStripeConfigResponse({ commerce: { stripeConfig: null } }),
    ).toBeNull();
  });
});
