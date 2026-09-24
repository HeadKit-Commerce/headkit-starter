import { describe, expect, it, vi } from "vitest";
import { OrganizationJsonLD } from "./organization-json-ld";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/branding", () => ({
  getBranding: async () => ({
    storeSettings: { name: "Acme", domain: "acme.example" },
    seoSettings: { allowIndexing: true },
  }),
}));

/**
 * The merchant-claim properties on the site-wide `Organization` node:
 * `telephone`, `email`, `hasMerchantReturnPolicy` and `hasShippingService`.
 *
 * These are PUBLIC PROMISES — what the business will do for a customer — so
 * none of them is defaulted and the starter's own `app/layout.tsx` passes none.
 * The property under test is therefore two-sided: a store that supplies a real
 * value gets it in the graph verbatim, and a store that supplies nothing emits
 * no key at all rather than an empty or invented one.
 *
 * SCOPE: the serialisation only. Nothing here says which values are TRUE for
 * any store — that belongs beside whatever assembles them — and nothing here
 * proves the node reaches the served HTML.
 */

type ScriptElement = { props: { dangerouslySetInnerHTML: { __html: string } } };

async function graphOf(
  element: Promise<unknown> | unknown,
): Promise<Record<string, unknown>> {
  const rendered = (await element) as ScriptElement;
  return JSON.parse(rendered.props.dangerouslySetInnerHTML.__html) as Record<
    string,
    unknown
  >;
}

const RETURN_POLICY = {
  "@type": "MerchantReturnPolicy",
  applicableCountry: "AU",
  merchantReturnDays: 30,
} as const;

const SHIPPING = [
  {
    "@type": "ShippingService",
    name: "Standard Delivery",
    fulfillmentType: "https://schema.org/FulfillmentTypeDelivery",
  },
] as const;

describe("OrganizationJsonLD merchant claims", () => {
  it("passes a supplied policy and shipping service through verbatim", async () => {
    const graph = await graphOf(
      OrganizationJsonLD({
        name: "Acme",
        url: "https://acme.example",
        telephone: "+61 8 1234 5678",
        email: "info@acme.example",
        hasMerchantReturnPolicy: { ...RETURN_POLICY },
        hasShippingService: SHIPPING.map((service) => ({ ...service })),
      }),
    );

    expect(graph.telephone).toBe("+61 8 1234 5678");
    expect(graph.email).toBe("info@acme.example");
    // Verbatim: the component must not reshape, default or prune a claim it
    // did not author. A store's source is the store's to state.
    expect(graph.hasMerchantReturnPolicy).toEqual(RETURN_POLICY);
    expect(graph.hasShippingService).toEqual(SHIPPING);
  });

  it("emits no key at all for a claim the caller did not make", async () => {
    // The starter's own layout is this caller. An empty `hasShippingService`
    // is treated as no claim rather than as "this merchant ships nothing".
    const graph = await graphOf(
      OrganizationJsonLD({
        name: "Acme",
        url: "https://acme.example",
        hasShippingService: [],
      }),
    );

    expect(graph).not.toHaveProperty("telephone");
    expect(graph).not.toHaveProperty("email");
    expect(graph).not.toHaveProperty("hasMerchantReturnPolicy");
    expect(graph).not.toHaveProperty("hasShippingService");
  });
});
