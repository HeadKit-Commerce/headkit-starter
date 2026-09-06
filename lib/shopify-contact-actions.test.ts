import { beforeEach, describe, expect, it, vi } from "vitest";

const { postShopifyContactMock, envState } = vi.hoisted(() => ({
  postShopifyContactMock: vi.fn(),
  envState: {
    SHOPIFY_STORE_DOMAIN: "velvet.myshopify.com" as string | undefined,
    NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: undefined as string | undefined,
  },
}));

vi.mock("@/lib/env", () => ({
  env: envState,
}));

vi.mock("./shopify-contact", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./shopify-contact")>();
  return {
    ...actual,
    postShopifyContact: postShopifyContactMock,
  };
});

import { submitShopifyContact } from "./shopify-contact-actions";

describe("submitShopifyContact", () => {
  beforeEach(() => {
    postShopifyContactMock.mockReset();
    postShopifyContactMock.mockResolvedValue(undefined);
    envState.SHOPIFY_STORE_DOMAIN = "velvet.myshopify.com";
    envState.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN = undefined;
  });

  it("POSTs the shopper fields to the shop host", async () => {
    const result = await submitShopifyContact({
      name: "Ada",
      email: "ada@example.com",
      phone: "0400 000 000",
      body: "Hello",
      context: "contact",
    });

    expect(result).toEqual({ ok: true });
    expect(postShopifyContactMock).toHaveBeenCalledWith(
      "velvet.myshopify.com",
      expect.objectContaining({
        name: "Ada",
        email: "ada@example.com",
        phone: "0400 000 000",
        body: "Hello",
        context: "contact",
      }),
    );
  });

  it("fails closed when the shop domain is missing", async () => {
    envState.SHOPIFY_STORE_DOMAIN = undefined;
    envState.NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN = undefined;

    const result = await submitShopifyContact({
      name: "Ada",
      email: "ada@example.com",
      body: "Hello",
    });

    expect(result.ok).toBe(false);
    expect(postShopifyContactMock).not.toHaveBeenCalled();
  });

  it("returns a shopper error when Shopify rejects the POST", async () => {
    postShopifyContactMock.mockRejectedValue(new Error("400"));

    const result = await submitShopifyContact({
      name: "Ada",
      email: "ada@example.com",
      body: "Hello",
    });

    expect(result).toEqual({
      ok: false,
      error: "We couldn't send your message. Please try again shortly.",
    });
  });
});
