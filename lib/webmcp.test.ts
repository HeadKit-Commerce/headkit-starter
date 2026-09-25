// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  projectCart,
  projectSearchHit,
  registerWebMcpTools,
  resolveCheckoutPlan,
  resolveModelContext,
  validateBrowsePath,
  WEBMCP_TOOL_NAMES,
  type WebMcpCartSource,
  type WebMcpDeps,
  type WebMcpModelContext,
  type WebMcpProductView,
  type WebMcpToolRegistration,
} from "@/lib/webmcp";

function harness(): {
  ctx: WebMcpModelContext;
  tools: Map<string, WebMcpToolRegistration>;
  unregistered: string[];
} {
  const tools = new Map<string, WebMcpToolRegistration>();
  const unregistered: string[] = [];
  const ctx: WebMcpModelContext = {
    registerTool: (tool) => {
      tools.set(tool.name, tool);
      return {
        unregister: () => {
          unregistered.push(tool.name);
        },
      };
    },
    unregisterTool: (name) => {
      unregistered.push(`by-name:${name}`);
    },
  };
  return { ctx, tools, unregistered };
}

function productView(path: string, unknownColour = false): WebMcpProductView {
  return {
    id: "p1",
    name: "Helmet",
    slug: "helmet",
    path,
    stockStatus: "instock",
    variations: [],
    variationsTruncated: false,
    unknownColour,
  };
}

function deps(overrides: Partial<WebMcpDeps> = {}): WebMcpDeps {
  return {
    hidePrices: false,
    searchProducts: async () => [
      {
        id: "p1",
        name: "Helmet",
        slug: "helmet",
        uri: "/shop/gear/helmet",
        stockStatus: "instock",
        price: "120.00",
      },
    ],
    getProduct: async () => productView("/shop/gear/helmet"),
    getCart: async () =>
      ({
        token: "secret-token",
        checkoutUrl: "https://shop.example/checkout",
        itemsCount: 1,
        currency: { code: "AUD" },
        items: [
          {
            key: "line-1",
            name: "Helmet",
            slug: "helmet",
            quantity: 1,
            stockStatus: "instock",
            variation: [{ attribute: "Size", value: "M" }],
            prices: { price: "120" },
            totals: { lineSubtotal: "120", lineSubtotalTax: "12" },
          },
        ],
        totals: { totalPrice: "132" },
        appliedGiftCards: [{ code: "GIFT" }],
      }) as WebMcpCartSource,
    applyUpdate: async () => ({
      ok: true,
      cart: { itemsCount: 0, items: [], currency: { code: "AUD" } },
    }),
    removeLine: async () => ({
      ok: true,
      cart: { itemsCount: 0, items: [], currency: { code: "AUD" } },
    }),
    navigate: () => undefined,
    assignExternal: () => undefined,
    checkoutPlan: async () =>
      resolveCheckoutPlan({ quote: false, hostedUrl: null }),
    ...overrides,
  };
}

describe("resolveModelContext", () => {
  it("prefers document.modelContext over the navigator alias", () => {
    const documentContext = { registerTool: () => undefined };
    const navigatorContext = { registerTool: () => undefined };
    const resolved = resolveModelContext({
      document: { modelContext: documentContext },
      navigator: { modelContext: navigatorContext },
    });
    expect(resolved).toBe(documentContext);
  });

  it("falls back to navigator.modelContext", () => {
    const navigatorContext = { registerTool: () => undefined };
    expect(
      resolveModelContext({
        document: {},
        navigator: { modelContext: navigatorContext },
      }),
    ).toBe(navigatorContext);
  });

  it("returns null when neither host exposes registerTool", () => {
    expect(resolveModelContext({ document: {}, navigator: {} })).toBeNull();
  });
});

describe("catalogue and cart projections", () => {
  it("builds the canonical path and omits price in quote mode", () => {
    const hit = projectSearchHit(
      {
        id: "p1",
        name: "Helmet",
        slug: "helmet",
        uri: "/shop/gear/helmet",
        stockStatus: "instock",
        price: "120.00",
      },
      true,
    );
    expect(hit.path).toBe("/shop/gear/helmet");
    expect(hit).not.toHaveProperty("price");
  });

  it("omits the cart token, checkout URL, and gift-card code", () => {
    const view = projectCart(
      {
        itemsCount: 1,
        currency: { code: "AUD" },
        items: [
          {
            key: "line-1",
            name: "Helmet",
            slug: "helmet",
            quantity: 1,
            stockStatus: "instock",
            totals: { lineSubtotal: "100", lineSubtotalTax: "10" },
          },
        ],
        totals: { totalPrice: "110" },
        appliedGiftCards: [{ code: "GIFT" }],
      } as WebMcpCartSource,
      false,
    );
    expect(view).not.toHaveProperty("token");
    expect(view).not.toHaveProperty("checkoutUrl");
    expect(JSON.stringify(view)).not.toContain("GIFT");
    expect(view.items[0]?.lineTotal).toBe(110);
    expect(view.total).toBe(110);
  });

  it("does not copy a hosted checkout URL into the cart view", () => {
    const view = projectCart(
      {
        checkoutUrl: "https://pay.example/c",
        itemsCount: 1,
        items: [
          {
            key: "line-1",
            quantity: 1,
            totals: { lineSubtotal: "100", lineSubtotalTax: "10" },
          },
        ],
        totals: { totalPrice: "110" },
      },
      false,
    );
    expect(JSON.stringify(view)).not.toContain("pay.example");
    // Hosted totals already include tax, so the line sibling is not added.
    expect(view.items[0]?.lineTotal).toBe(100);
    expect(view.total).toBe(110);
  });

  it("omits money when prices are hidden", () => {
    const view = projectCart(
      {
        itemsCount: 1,
        items: [
          {
            key: "line-1",
            quantity: 1,
            totals: { lineSubtotal: "100", lineSubtotalTax: "10" },
          },
        ],
        totals: { totalPrice: "110" },
      },
      true,
    );
    expect(view.items[0]).not.toHaveProperty("lineTotal");
    expect(view).not.toHaveProperty("total");
  });
});

describe("validateBrowsePath", () => {
  it.each([
    ["//evil.example", null],
    ["https://evil.example/shop", null],
    ["/shop/../admin", null],
    ["/shop/%2e%2e/admin", null],
    ["\\shop", null],
    ["/checkout", null],
    ["/shop/gear", "/shop/gear"],
    ["/", "/"],
    ["/products/helmet", "/products/helmet"],
  ])("%j -> %j", (raw, expected) => {
    expect(validateBrowsePath(raw)).toBe(expected);
  });
});

describe("resolveCheckoutPlan", () => {
  it("sends quote stores to /quote", () => {
    expect(
      resolveCheckoutPlan({ quote: true, hostedUrl: "https://x" }),
    ).toEqual({
      kind: "quote",
      path: "/quote",
      externalUrl: null,
    });
  });

  it("keeps a hosted URL off the tool-facing path", () => {
    expect(
      resolveCheckoutPlan({
        quote: false,
        hostedUrl: "https://shop.example/cart/c/abc",
      }).kind,
    ).toBe("shopify_checkout");
  });

  it("sends WooCommerce carts to /checkout, including a free cart", () => {
    expect(resolveCheckoutPlan({ quote: false, hostedUrl: null })).toEqual({
      kind: "checkout",
      path: "/checkout",
      externalUrl: null,
    });
  });
});

describe("registerWebMcpTools", () => {
  it("registers the Shopify-aligned names and annotations", () => {
    const { ctx, tools } = harness();
    const controller = new AbortController();
    registerWebMcpTools(ctx, deps(), controller.signal);
    expect([...tools.keys()]).toEqual([...WEBMCP_TOOL_NAMES]);
    expect(tools.get("search_catalog")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.get("cancel_cart")?.annotations?.destructiveHint).toBe(true);
    expect(tools.get("update_cart")?.annotations?.readOnlyHint).toBe(false);
    controller.abort();
  });

  it("search omits price when the store is in quote mode", async () => {
    const { ctx, tools } = harness();
    registerWebMcpTools(
      ctx,
      deps({ hidePrices: true }),
      new AbortController().signal,
    );
    const result = await tools
      .get("search_catalog")
      ?.execute({ query: "helm" });
    expect(result).toMatchObject({ ok: true });
    const products = (result as { products: Array<Record<string, unknown>> })
      .products;
    expect(products[0]?.["path"]).toBe("/shop/gear/helmet");
    expect(products[0]).not.toHaveProperty("price");
  });

  it("show_variant navigates to the resolved path, not a caller URL", async () => {
    const navigated: string[] = [];
    const { ctx, tools } = harness();
    registerWebMcpTools(
      ctx,
      deps({
        getProduct: async () => productView("/shop/gear/helmet/black"),
        navigate: (path) => {
          navigated.push(path);
        },
      }),
      new AbortController().signal,
    );
    const result = await tools.get("show_variant")?.execute({
      slug: "helmet",
      colourSlug: "black",
      path: "https://evil.example/products/helmet",
    });
    expect(navigated).toEqual(["/shop/gear/helmet/black"]);
    expect(result).toMatchObject({ ok: true, path: "/shop/gear/helmet/black" });
  });

  it("get_cart does not return the session token", async () => {
    const { ctx, tools } = harness();
    registerWebMcpTools(ctx, deps(), new AbortController().signal);
    const result = await tools.get("get_cart")?.execute({});
    const encoded = JSON.stringify(result);
    expect(encoded).not.toContain("secret-token");
    expect(encoded).not.toContain("shop.example");
    expect(encoded).not.toContain("GIFT");
  });

  it("serializes cart writes and calls add once per update", async () => {
    const calls: string[] = [];
    let releaseFirst: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const { ctx, tools } = harness();
    registerWebMcpTools(
      ctx,
      deps({
        applyUpdate: async (update) => {
          calls.push(update.action);
          if (calls.length === 1) await gate;
          return { ok: true, cart: { itemsCount: 0, items: [] } };
        },
      }),
      new AbortController().signal,
    );
    const first = tools.get("update_cart")?.execute({
      action: "add",
      productId: "42",
      quantity: 1,
    });
    const second = tools.get("update_cart")?.execute({
      action: "remove",
      key: "line-1",
    });
    await Promise.resolve();
    expect(calls).toEqual(["add"]);
    releaseFirst?.();
    await Promise.all([first, second]);
    expect(calls).toEqual(["add", "remove"]);
  });

  it("cancel_cart removes each line and does not clear a token", async () => {
    const removed: string[] = [];
    const { ctx, tools } = harness();
    registerWebMcpTools(
      ctx,
      deps({
        getCart: async () => ({
          items: [{ key: "a" }, { key: "b" }],
        }),
        removeLine: async (key) => {
          removed.push(key);
          return { ok: true, cart: { items: [] } };
        },
      }),
      new AbortController().signal,
    );
    const result = await tools.get("cancel_cart")?.execute({});
    expect(removed).toEqual(["a", "b"]);
    expect(result).toMatchObject({ ok: true, cleared: true });
    expect(JSON.stringify(result)).not.toContain("clearCartToken");
  });

  it("proceed_to_checkout returns the destination kind without the hosted URL", async () => {
    const assigned: string[] = [];
    const { ctx, tools } = harness();
    registerWebMcpTools(
      ctx,
      deps({
        assignExternal: (url) => {
          assigned.push(url);
        },
        checkoutPlan: async () =>
          resolveCheckoutPlan({
            quote: false,
            hostedUrl: "https://shop.example/checkouts/cn/abc",
          }),
      }),
      new AbortController().signal,
    );
    const result = await tools.get("proceed_to_checkout")?.execute({});
    expect(assigned).toEqual(["https://shop.example/checkouts/cn/abc"]);
    expect(result).toEqual({ ok: true, destination: "shopify_checkout" });
    expect(JSON.stringify(result)).not.toContain("shop.example");
  });

  it("browse_store rejects an external URL", async () => {
    const navigated: string[] = [];
    const { ctx, tools } = harness();
    registerWebMcpTools(
      ctx,
      deps({
        navigate: (path) => {
          navigated.push(path);
        },
      }),
      new AbortController().signal,
    );
    const result = await tools.get("browse_store")?.execute({
      path: "https://evil.example",
    });
    expect(result).toEqual({ ok: false, error: "invalid path" });
    expect(navigated).toEqual([]);
  });

  it("unregisters every tool on cleanup", () => {
    const { ctx, tools, unregistered } = harness();
    const unregister = registerWebMcpTools(
      ctx,
      deps(),
      new AbortController().signal,
    );
    unregister();
    expect(unregistered.filter((name) => !name.startsWith("by-name:"))).toEqual(
      [...tools.keys()],
    );
    expect(
      unregistered.filter((name) => name.startsWith("by-name:")),
    ).toHaveLength(tools.size);
  });
});

describe("the layout gate", () => {
  it("renders the registrar only behind the store setting, inside CheckoutModeProvider", () => {
    const layout = readFileSync("app/layout.tsx", "utf8");
    expect(layout).toMatch(
      /\{\s*webmcpEnabled\s*\?\s*\(?\s*<WebMcpRegistrar\s*\/>\s*\)?\s*:\s*null\s*\}/,
    );
    expect(layout).not.toContain("NEXT_PUBLIC_WEBMCP");
    expect(layout).not.toContain("webmcp-flag");
    expect(layout.match(/<WebMcpRegistrar \/>/g)).toHaveLength(1);
    const provider = layout.indexOf("<CheckoutModeProvider");
    const mount = layout.indexOf("<WebMcpRegistrar />");
    const close = layout.indexOf("</CheckoutModeProvider>");
    expect(provider).toBeGreaterThan(-1);
    expect(mount).toBeGreaterThan(provider);
    expect(mount).toBeLessThan(close);
    // Comments name cookies() as the thing this layout must not call.
    const code = layout
      .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bcookies\s*\(/);
    expect(code).not.toMatch(/<Suspense[^>]*>\s*\{children\}/);
  });
});
