import { beforeEach, describe, expect, it, vi } from "vitest";

const { postShopifyContactMock, subscribeEmailMock, envState } = vi.hoisted(
  () => ({
    postShopifyContactMock: vi.fn(),
    subscribeEmailMock: vi.fn(),
    envState: {
      SHOPIFY_STORE_DOMAIN: "velvet.myshopify.com" as string | undefined,
      NEXT_PUBLIC_SHOPIFY_STORE_DOMAIN: undefined as string | undefined,
      NEXT_PUBLIC_HEADKIT_PUBLIC_KEY: "pk_test",
      NEXT_PUBLIC_GRAPHQL_URL: "https://graph.example/graphql",
      HEADKIT_PRIVATE_KEY: "sk_test",
    },
  }),
);

vi.mock("@/lib/env", () => ({
  env: envState,
}));

vi.mock("./email-marketing-actions", () => ({
  subscribeEmailAction: subscribeEmailMock,
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
    subscribeEmailMock.mockReset();
    subscribeEmailMock.mockResolvedValue({ success: true });
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

  it("subscribes to the store list after a successful POST when asked", async () => {
    const result = await submitShopifyContact({
      name: "Ada",
      email: "ada@example.com",
      body: "Hello",
      context: "contact",
      subscribe: true,
    });

    expect(result).toEqual({ ok: true });
    expect(subscribeEmailMock).toHaveBeenCalledWith({
      email: "ada@example.com",
      source: "form",
    });
  });

  it("still succeeds when the list subscribe fails", async () => {
    subscribeEmailMock.mockResolvedValue({ success: false, error: "nope" });

    const result = await submitShopifyContact({
      name: "Ada",
      email: "ada@example.com",
      body: "Hello",
      subscribe: true,
    });

    expect(result).toEqual({ ok: true });
    expect(subscribeEmailMock).toHaveBeenCalled();
  });

  it("does not subscribe when the checkbox is off", async () => {
    await submitShopifyContact({
      name: "Ada",
      email: "ada@example.com",
      body: "Hello",
      subscribe: false,
    });

    expect(subscribeEmailMock).not.toHaveBeenCalled();
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
