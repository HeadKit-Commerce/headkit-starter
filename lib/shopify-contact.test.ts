import { describe, expect, it, vi } from "vitest";
import {
  buildShopifyContactBody,
  encodeShopifyContactForm,
  extrasFromEnquiryValues,
  postShopifyContact,
  shopifyContactAccepted,
  shopifyContactBodyPrefix,
  shopifyContactEndpoint,
  shopifyContactOrigin,
} from "./shopify-contact";

describe("shopifyContactOrigin / endpoint", () => {
  it("strips scheme and trailing slash", () => {
    expect(shopifyContactOrigin("https://velvet.myshopify.com/")).toBe(
      "https://velvet.myshopify.com",
    );
    expect(shopifyContactEndpoint("velvet.myshopify.com")).toBe(
      "https://velvet.myshopify.com/contact",
    );
  });

  it("rejects an empty domain", () => {
    expect(() => shopifyContactOrigin("  ")).toThrow(/empty/);
  });
});

describe("body prefix and extras", () => {
  it("prefixes product and general enquiries only", () => {
    expect(shopifyContactBodyPrefix("contact")).toBe("");
    expect(shopifyContactBodyPrefix(undefined)).toBe("");
    expect(shopifyContactBodyPrefix("product")).toBe("Product enquiry");
    expect(shopifyContactBodyPrefix("general")).toBe("Enquiry");
  });

  it("appends product extras after the message", () => {
    expect(
      buildShopifyContactBody({
        name: "Ada",
        email: "ada@example.com",
        body: "Need a sample",
        context: "product",
        extras: [
          { label: "Product Name", value: "Velvet Sofa" },
          { label: "Product URL", value: "https://shop.example/sofa" },
        ],
      }),
    ).toBe(
      "Product enquiry\n\nNeed a sample\n\nProduct Name: Velvet Sofa\nProduct URL: https://shop.example/sofa",
    );
  });

  it("maps enquiry field names once each", () => {
    expect(
      extrasFromEnquiryValues([
        { fieldName: "product_name", value: "Sofa" },
        { fieldName: "colour", value: "ignored" },
        { fieldName: "product_colour", value: "Ink" },
        { fieldName: "product_name", value: "duplicate" },
      ]),
    ).toEqual([
      { label: "Product Name", value: "Sofa" },
      { label: "Product Colour", value: "Ink" },
    ]);
  });
});

describe("encodeShopifyContactForm", () => {
  it("posts Dawn/Horizon contact fields", () => {
    const vals = encodeShopifyContactForm({
      name: "Ada Lovelace",
      email: "ada@example.com",
      phone: "0400 000 000",
      body: "Hello",
    });
    expect(vals.get("form_type")).toBe("contact");
    expect(vals.get("utf8")).toBe("✓");
    expect(vals.get("contact[email]")).toBe("ada@example.com");
    expect(vals.get("contact[name]")).toBe("Ada Lovelace");
    expect(vals.get("contact[phone]")).toBe("0400 000 000");
    expect(vals.get("contact[body]")).toBe("Hello");
  });

  it("requires email", () => {
    expect(() =>
      encodeShopifyContactForm({ name: "Ada", email: "  ", body: "Hi" }),
    ).toThrow(/email is required/);
  });
});

describe("shopifyContactAccepted", () => {
  it("treats Shopify's 302 success as accepted", () => {
    expect(shopifyContactAccepted(302)).toBe(true);
    expect(shopifyContactAccepted(200)).toBe(true);
    expect(shopifyContactAccepted(400)).toBe(false);
    expect(shopifyContactAccepted(500)).toBe(false);
  });
});

describe("postShopifyContact", () => {
  it("POSTs to the shop host and does not follow redirects", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { Location: "/?contact_posted=true" },
      }),
    );

    await postShopifyContact(
      "velvet.myshopify.com",
      { name: "Ada", email: "ada@example.com", body: "Hello" },
      fetchImpl,
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://velvet.myshopify.com/contact");
    expect(init?.method).toBe("POST");
    expect(init?.redirect).toBe("manual");
    expect(init?.headers).toMatchObject({
      Origin: "https://velvet.myshopify.com",
      Referer: "https://velvet.myshopify.com/",
      "Content-Type": "application/x-www-form-urlencoded",
    });
    expect(String(init?.body)).toContain("form_type=contact");
    expect(String(init?.body)).toContain("contact%5Bemail%5D=ada%40example.com");
  });

  it("rejects a 4xx from the shop", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("no", { status: 400 }));

    await expect(
      postShopifyContact(
        "velvet.myshopify.com",
        { name: "Ada", email: "ada@example.com", body: "Hello" },
        fetchImpl,
      ),
    ).rejects.toThrow(/400/);
  });
});
