import { productPath, type CanonicalProductRef } from "@/lib/canonical-path";
import { lineDisplayTotal, type LineTotalsLike } from "@/lib/cart-prices";
import { hasHostedCheckout } from "@/lib/hosted-checkout";
import { getFloatVal } from "@/lib/utils";

/**
 * HeadKit's WebMCP tools. One registrar, mounted from the root layout only
 * when the store's dashboard WebMCP setting is on (`storeSettings.webmcpEnabled`
 * in `lib/branding.ts`). Absent means off. There is no env flag.
 *
 * These are the W3C / Chrome `document.modelContext.registerTool` tools, the
 * same surface Shopify and Stripe document — not the webmcp.dev widget.
 * Shopify's storefront script is not loaded: HeadKit's cart is the
 * `x-cart-token` cart, and that script would mutate Shopify's cart beside it.
 * Stripe.js may register card and wallet tools inside CheckoutProvider when
 * the browser supports WebMCP. This module does not reimplement those tools,
 * does not confirm a payment, and does not return a client secret. Whether
 * the pinned Stripe.js build actually registers them is unverified.
 *
 * Tool results are projections. A cart token, checkout URL, gift-card code,
 * or raw provider error never leaves this module.
 */

export const WEBMCP_TOOL_NAMES = [
  "search_catalog",
  "get_product",
  "show_variant",
  "browse_store",
  "get_cart",
  "update_cart",
  "cancel_cart",
  "proceed_to_checkout",
  "manage_orders",
] as const;

export type WebMcpToolName = (typeof WEBMCP_TOOL_NAMES)[number];

const SEARCH_LIMIT_DEFAULT = 8;
const SEARCH_LIMIT_MAX = 12;
const CART_ITEM_CAP = 50;
const QUANTITY_MAX = 99;
const VARIATION_INPUT_CAP = 8;
const PATH_MAX = 300;
const QUERY_MAX = 200;

const BROWSE_PREFIXES = [
  "/",
  "/shop",
  "/collections",
  "/brand",
  "/news",
  "/projects",
  "/products",
] as const;

export interface WebMcpToolRegistration {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
  };
  execute: (
    input: unknown,
    agent?: { signal?: AbortSignal },
  ) => Promise<unknown>;
}

export interface WebMcpToolHandle {
  unregister?: () => void;
}

export interface WebMcpModelContext {
  registerTool: (tool: WebMcpToolRegistration) => WebMcpToolHandle | void;
  unregisterTool?: (name: string) => void;
}

export interface WebMcpSearchHit {
  id: string;
  name: string;
  slug: string;
  path: string;
  stockStatus: string;
  price?: string;
}

export interface WebMcpProductVariation {
  id: string;
  stockStatus: string;
  attributes: Array<{ key: string; value: string }>;
  price?: string;
}

export interface WebMcpProductView {
  id: string;
  name: string;
  slug: string;
  path: string;
  stockStatus: string;
  variations: WebMcpProductVariation[];
  variationsTruncated: boolean;
  unknownColour: boolean;
  price?: string;
}

export interface WebMcpCartLine {
  key: string;
  name: string;
  slug: string;
  quantity: number;
  stockStatus: string;
  variation: Array<{ attribute: string; value: string }>;
  lineTotal?: number;
}

export interface WebMcpCartView {
  itemsCount: number;
  currency: string | null;
  items: WebMcpCartLine[];
  truncated: boolean;
  total?: number;
}

export interface WebMcpCartSource {
  checkoutUrl?: string | null;
  itemsCount?: number | null;
  currency?: { code?: string | null } | null;
  items?: ReadonlyArray<WebMcpCartLineSource | null> | null;
  totals?: { totalPrice?: string | null } | null;
}

export interface WebMcpCartLineSource {
  key?: string | null;
  name?: string | null;
  slug?: string | null;
  quantity?: number | null;
  stockStatus?: string | null;
  variation?: ReadonlyArray<{
    attribute?: string | null;
    value?: string | null;
  } | null> | null;
  prices?: { price?: string | null } | null;
  totals?: LineTotalsLike | null;
}

export type WebMcpCartUpdate =
  | {
      action: "add";
      productId: string;
      quantity: number;
      variation: Array<{ attribute: string; value: string }>;
    }
  | { action: "set_quantity"; key: string; quantity: number }
  | { action: "remove"; key: string };

export interface WebMcpCheckoutPlan {
  kind: "quote" | "shopify_checkout" | "checkout";
  path: "/quote" | "/checkout" | null;
  /** Present only for a hosted checkout. Never copied into a tool result. */
  externalUrl: string | null;
}

export interface WebMcpDeps {
  hidePrices: boolean;
  searchProducts: (
    query: string,
    limit: number,
  ) => Promise<ReadonlyArray<WebMcpCatalogProduct | null>>;
  getProduct: (
    slug: string,
    colourSlug: string | undefined,
  ) => Promise<WebMcpProductView | null>;
  getCart: () => Promise<WebMcpCartSource | null>;
  applyUpdate: (
    update: WebMcpCartUpdate,
  ) => Promise<
    { ok: true; cart: WebMcpCartSource | null } | { ok: false; error: string }
  >;
  removeLine: (
    key: string,
  ) => Promise<
    { ok: true; cart: WebMcpCartSource | null } | { ok: false; error: string }
  >;
  navigate: (path: string) => void;
  assignExternal: (url: string) => void;
  checkoutPlan: () => Promise<WebMcpCheckoutPlan>;
}

export interface WebMcpCatalogProduct extends CanonicalProductRef {
  id: string;
  name: string;
  stockStatus: string;
  price?: string | null;
}

const objectSchema = (
  properties: Record<string, unknown>,
  required: string[],
): Record<string, unknown> => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isModelContext(value: unknown): value is WebMcpModelContext {
  return isRecord(value) && typeof value["registerTool"] === "function";
}

function readModelContext(host: object | null | undefined): unknown {
  if (!host || !("modelContext" in host)) return undefined;
  return (host as { modelContext?: unknown }).modelContext;
}

/**
 * `document.modelContext` is the current name. `navigator.modelContext` is
 * the older alias Chrome kept. Prefer the document one when both exist.
 */
export function resolveModelContext(scope: {
  document?: object | null;
  navigator?: object | null;
}): WebMcpModelContext | null {
  const fromDocument = readModelContext(scope.document);
  if (isModelContext(fromDocument)) return fromDocument;
  const fromNavigator = readModelContext(scope.navigator);
  if (isModelContext(fromNavigator)) return fromNavigator;
  return null;
}

export function projectSearchHit(
  product: WebMcpCatalogProduct,
  hidePrices: boolean,
): WebMcpSearchHit {
  const hit: WebMcpSearchHit = {
    id: product.id,
    name: product.name,
    slug: product.slug,
    path: productPath(product),
    stockStatus: product.stockStatus,
  };
  if (!hidePrices && product.price) {
    hit.price = product.price;
  }
  return hit;
}

export function projectCart(
  cart: WebMcpCartSource | null,
  hidePrices: boolean,
): WebMcpCartView {
  const lines = cart?.items ?? [];
  const projected: WebMcpCartLine[] = [];
  for (const line of lines) {
    if (projected.length >= CART_ITEM_CAP) break;
    if (!line?.key) continue;
    const variation: Array<{ attribute: string; value: string }> = [];
    for (const entry of line.variation ?? []) {
      if (!entry?.attribute || !entry.value) continue;
      variation.push({ attribute: entry.attribute, value: entry.value });
    }
    const view: WebMcpCartLine = {
      key: line.key,
      name: line.name ?? "",
      slug: line.slug ?? "",
      quantity: line.quantity ?? 0,
      stockStatus: line.stockStatus ?? "",
      variation,
    };
    if (!hidePrices) {
      // Only checkoutUrl decides the tax convention. The rest of the cart
      // source is not a DisplayTotalsSource (its totals carry totalPrice).
      view.lineTotal = lineDisplayTotal(line.totals, line.prices?.price, {
        checkoutUrl: cart?.checkoutUrl ?? null,
      });
    }
    projected.push(view);
  }
  const view: WebMcpCartView = {
    itemsCount: cart?.itemsCount ?? projected.length,
    currency: cart?.currency?.code ?? null,
    items: projected,
    truncated: lines.length > CART_ITEM_CAP,
  };
  if (!hidePrices && cart?.totals?.totalPrice != null) {
    view.total = getFloatVal(cart.totals.totalPrice);
  }
  return view;
}

/**
 * A shop-relative path an agent may open. Rejects protocol-relative URLs,
 * traversal, backslashes, and encoded dots or slashes.
 */
export function validateBrowsePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > PATH_MAX) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || raw.includes("..")) return null;
  if (/[\u0000-\u001f\u007f]/.test(raw)) return null;
  if (/%2e|%2f|%5c/i.test(raw)) return null;
  let decoded = raw;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  if (
    decoded.includes("..") ||
    decoded.includes("\\") ||
    decoded.includes("//")
  ) {
    return null;
  }
  const pathOnly = decoded.split(/[?#]/, 1)[0] ?? "";
  if (!pathOnly.startsWith("/")) return null;
  const allowed = BROWSE_PREFIXES.some((prefix) => {
    if (prefix === "/") return pathOnly === "/";
    return pathOnly === prefix || pathOnly.startsWith(`${prefix}/`);
  });
  return allowed ? pathOnly : null;
}

export function resolveCheckoutPlan(input: {
  quote: boolean;
  hostedUrl: string | null;
}): WebMcpCheckoutPlan {
  if (input.quote) {
    return { kind: "quote", path: "/quote", externalUrl: null };
  }
  if (input.hostedUrl && hasHostedCheckout({ checkoutUrl: input.hostedUrl })) {
    return {
      kind: "shopify_checkout",
      path: null,
      externalUrl: input.hostedUrl,
    };
  }
  return { kind: "checkout", path: "/checkout", externalUrl: null };
}

function readString(
  input: Record<string, unknown>,
  key: string,
): string | null {
  const value = input[key];
  return typeof value === "string" ? value : null;
}

function clampLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return SEARCH_LIMIT_DEFAULT;
  }
  const whole = Math.trunc(value);
  if (whole < 1) return 1;
  if (whole > SEARCH_LIMIT_MAX) return SEARCH_LIMIT_MAX;
  return whole;
}

function readQuantity(value: unknown, min: number): number | null {
  if (typeof value !== "number" || !Number.isInteger(value)) return null;
  if (value < min || value > QUANTITY_MAX) return null;
  return value;
}

function readSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,199}$/.test(value)) return null;
  return value;
}

function readLineKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (value.length < 1 || value.length > 200) return null;
  if (!/^[A-Za-z0-9_.:-]+$/.test(value)) return null;
  return value;
}

function readProductId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 128) return null;
  if (/[\s\\]/.test(trimmed)) return null;
  return trimmed;
}

function readVariation(
  value: unknown,
): Array<{ attribute: string; value: string }> | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > VARIATION_INPUT_CAP) return null;
  const variation: Array<{ attribute: string; value: string }> = [];
  for (const entry of value) {
    if (!isRecord(entry)) return null;
    const attribute = entry["attribute"];
    const option = entry["value"];
    if (typeof attribute !== "string" || typeof option !== "string")
      return null;
    if (
      attribute.length < 1 ||
      attribute.length > 80 ||
      option.length < 1 ||
      option.length > 80
    ) {
      return null;
    }
    variation.push({ attribute, value: option });
  }
  return variation;
}

function parseUpdate(input: unknown): WebMcpCartUpdate | null {
  if (!isRecord(input)) return null;
  const action = readString(input, "action");
  if (action === "add") {
    const productId = readProductId(input["productId"]);
    const quantity = readQuantity(input["quantity"], 1);
    const variation = readVariation(input["variation"]);
    if (!productId || quantity === null || !variation) return null;
    return { action: "add", productId, quantity, variation };
  }
  if (action === "set_quantity") {
    const key = readLineKey(input["key"]);
    const quantity = readQuantity(input["quantity"], 0);
    if (!key || quantity === null) return null;
    return { action: "set_quantity", key, quantity };
  }
  if (action === "remove") {
    const key = readLineKey(input["key"]);
    if (!key) return null;
    return { action: "remove", key };
  }
  return null;
}

function aborted(signal: AbortSignal | undefined): boolean {
  return signal?.aborted === true;
}

function failure(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/**
 * Registers the storefront tools and returns a function that removes them.
 * Cart writes share one queue so two agent calls cannot overlap a mutation.
 * An aborted signal refuses the call before a write starts; it does not
 * retry a write that already left.
 */
export function registerWebMcpTools(
  ctx: WebMcpModelContext,
  deps: WebMcpDeps,
  signal: AbortSignal,
): () => void {
  let chain: Promise<void> = Promise.resolve();
  const enqueue = <T>(fn: () => Promise<T>): Promise<T> => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };

  const tools: WebMcpToolRegistration[] = [
    {
      name: "search_catalog",
      description:
        "Search the store catalogue. Returns name, slug, canonical path, and stock. Prices are omitted in quote mode.",
      inputSchema: objectSchema(
        {
          query: { type: "string", maxLength: QUERY_MAX },
          limit: { type: "integer", minimum: 1, maximum: SEARCH_LIMIT_MAX },
        },
        ["query"],
      ),
      annotations: { readOnlyHint: true },
      execute: async (input, agent) => {
        if (aborted(signal) || aborted(agent?.signal))
          return failure("cancelled");
        if (!isRecord(input)) return failure("invalid input");
        const query = readString(input, "query")?.trim() ?? "";
        if (!query || query.length > QUERY_MAX) return failure("invalid query");
        const products = await deps.searchProducts(
          query,
          clampLimit(input["limit"]),
        );
        const hits: WebMcpSearchHit[] = [];
        for (const product of products) {
          if (!product?.id || !product.slug || !product.name) continue;
          hits.push(projectSearchHit(product, deps.hidePrices));
        }
        return { ok: true, products: hits };
      },
    },
    {
      name: "get_product",
      description:
        "Look up one product by slug. Returns the canonical path and a bounded variation list. Does not return description HTML.",
      inputSchema: objectSchema(
        {
          slug: { type: "string" },
          colourSlug: { type: "string" },
        },
        ["slug"],
      ),
      annotations: { readOnlyHint: true },
      execute: async (input, agent) => {
        if (aborted(signal) || aborted(agent?.signal))
          return failure("cancelled");
        if (!isRecord(input)) return failure("invalid input");
        const slug = readSlug(input["slug"]);
        if (!slug) return failure("invalid slug");
        const colour = readSlug(input["colourSlug"]);
        if (input["colourSlug"] !== undefined && !colour) {
          return failure("invalid colour");
        }
        const product = await deps.getProduct(slug, colour ?? undefined);
        if (!product) return failure("product not found");
        return { ok: true, product };
      },
    },
    {
      name: "show_variant",
      description:
        "Open a product on its canonical storefront path. The path is resolved by the store, not supplied by the caller.",
      inputSchema: objectSchema(
        {
          slug: { type: "string" },
          colourSlug: { type: "string" },
        },
        ["slug"],
      ),
      annotations: { readOnlyHint: true },
      execute: async (input, agent) => {
        if (aborted(signal) || aborted(agent?.signal))
          return failure("cancelled");
        if (!isRecord(input)) return failure("invalid input");
        const slug = readSlug(input["slug"]);
        if (!slug) return failure("invalid slug");
        const colour = readSlug(input["colourSlug"]);
        if (input["colourSlug"] !== undefined && !colour) {
          return failure("invalid colour");
        }
        const product = await deps.getProduct(slug, colour ?? undefined);
        if (!product) return failure("product not found");
        if (colour && product.unknownColour) return failure("unknown colour");
        deps.navigate(product.path);
        return { ok: true, path: product.path };
      },
    },
    {
      name: "browse_store",
      description:
        "Open a page on this storefront. Accepts a relative path under the shop, collections, brand, news, projects, or products routes.",
      inputSchema: objectSchema(
        { path: { type: "string", maxLength: PATH_MAX } },
        ["path"],
      ),
      annotations: { readOnlyHint: true },
      execute: async (input, agent) => {
        if (aborted(signal) || aborted(agent?.signal))
          return failure("cancelled");
        if (!isRecord(input)) return failure("invalid input");
        const path = validateBrowsePath(input["path"]);
        if (!path) return failure("invalid path");
        deps.navigate(path);
        return { ok: true, path };
      },
    },
    {
      name: "get_cart",
      description:
        "Read the current cart: line names, quantities, and display totals. Does not return the session token or gift-card codes.",
      inputSchema: objectSchema({}, []),
      annotations: { readOnlyHint: true },
      execute: async (_input, agent) => {
        if (aborted(signal) || aborted(agent?.signal))
          return failure("cancelled");
        const cart = await deps.getCart();
        return { ok: true, cart: projectCart(cart, deps.hidePrices) };
      },
    },
    {
      name: "update_cart",
      description:
        "Add a product, set a line quantity, or remove a line. Quantity 0 removes the line. Writes run one at a time.",
      inputSchema: objectSchema(
        {
          action: { type: "string", enum: ["add", "set_quantity", "remove"] },
          productId: { type: "string" },
          key: { type: "string" },
          quantity: { type: "integer", minimum: 0, maximum: QUANTITY_MAX },
          variation: {
            type: "array",
            maxItems: VARIATION_INPUT_CAP,
            items: objectSchema(
              {
                attribute: { type: "string" },
                value: { type: "string" },
              },
              ["attribute", "value"],
            ),
          },
        },
        ["action"],
      ),
      annotations: { readOnlyHint: false },
      execute: (input, agent) =>
        enqueue(async () => {
          if (aborted(signal) || aborted(agent?.signal))
            return failure("cancelled");
          const update = parseUpdate(input);
          if (!update) return failure("invalid input");
          const result = await deps.applyUpdate(update);
          if (!result.ok) return failure(result.error);
          return { ok: true, cart: projectCart(result.cart, deps.hidePrices) };
        }),
    },
    {
      name: "cancel_cart",
      description:
        "Remove every line from the cart, one line at a time. Does not clear the session cookie.",
      inputSchema: objectSchema({}, []),
      annotations: { readOnlyHint: false, destructiveHint: true },
      execute: (_input, agent) =>
        enqueue(async () => {
          if (aborted(signal) || aborted(agent?.signal))
            return failure("cancelled");
          const cart = await deps.getCart();
          const keys: string[] = [];
          for (const line of cart?.items ?? []) {
            if (line?.key) keys.push(line.key);
          }
          if (keys.length === 0) {
            return {
              ok: true,
              cleared: true,
              cart: projectCart(cart, deps.hidePrices),
            };
          }
          let latest: WebMcpCartSource | null = cart;
          for (const key of keys) {
            if (aborted(signal) || aborted(agent?.signal))
              return failure("cancelled");
            const result = await deps.removeLine(key);
            if (!result.ok) return failure(result.error);
            latest = result.cart;
          }
          return {
            ok: true,
            cleared: true,
            cart: projectCart(latest, deps.hidePrices),
          };
        }),
    },
    {
      name: "proceed_to_checkout",
      description:
        "Continue checkout. Quote stores open the quote page. Shopify stores leave for hosted checkout. WooCommerce stores open /checkout. Does not take payment.",
      inputSchema: objectSchema({}, []),
      annotations: { readOnlyHint: false },
      execute: async (_input, agent) => {
        if (aborted(signal) || aborted(agent?.signal))
          return failure("cancelled");
        const plan = await deps.checkoutPlan();
        if (plan.kind === "shopify_checkout") {
          if (plan.externalUrl) deps.assignExternal(plan.externalUrl);
          return { ok: true, destination: "shopify_checkout" };
        }
        if (!plan.path) return failure("checkout unavailable");
        deps.navigate(plan.path);
        return { ok: true, destination: plan.kind, path: plan.path };
      },
    },
    {
      name: "manage_orders",
      description:
        "Open the signed-in orders page. The shopper must already be signed in.",
      inputSchema: objectSchema({}, []),
      annotations: { readOnlyHint: true },
      execute: async (_input, agent) => {
        if (aborted(signal) || aborted(agent?.signal))
          return failure("cancelled");
        deps.navigate("/account/orders");
        return { ok: true, path: "/account/orders" };
      },
    },
  ];

  const registered: Array<{ name: string; unregister?: () => void }> = [];
  const unregisterAll = (): void => {
    for (const entry of registered) {
      try {
        entry.unregister?.();
      } catch {
        // The browser may already have dropped the tool.
      }
      try {
        ctx.unregisterTool?.(entry.name);
      } catch {
        // unregisterTool is optional on older aliases.
      }
    }
    registered.length = 0;
  };

  for (const tool of tools) {
    try {
      const handle = ctx.registerTool(tool);
      const unregister =
        handle && typeof handle.unregister === "function"
          ? handle.unregister.bind(handle)
          : undefined;
      registered.push(
        unregister ? { name: tool.name, unregister } : { name: tool.name },
      );
    } catch {
      unregisterAll();
      return () => undefined;
    }
  }

  if (signal.aborted) {
    unregisterAll();
    return () => undefined;
  }
  const onAbort = (): void => unregisterAll();
  signal.addEventListener("abort", onAbort, { once: true });
  return () => {
    signal.removeEventListener("abort", onAbort);
    unregisterAll();
  };
}
