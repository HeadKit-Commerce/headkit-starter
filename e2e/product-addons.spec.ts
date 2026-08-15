import {
  test,
  expect,
  request,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { BASE_URL, WP_BASE_URL, STORE_API, stackIsUp } from "./helpers";

/**
 * WooCommerce Product Add-Ons end-to-end — the PLUGIN-PRESENT half (phase 14.1,
 * plan 14.1-07).
 *
 * Every claim this phase makes up to here is asserted at the layer that produced
 * it: the theme's payload in PHP, the wire shape in Go, the encoder in a vitest
 * unit. This spec is where those layers are checked against EACH OTHER, because
 * three of the phase's success criteria are only falsifiable from an end-to-end
 * run — that the charged price is the plugin's, that the selections reach the
 * merchant's order, and that a rejected submission no longer wedges checkout.
 *
 * REQUIREMENT MAP
 *
 *   PAO-02  "pricing and validation are the plugin's, server-side"
 *     - `price authority` — a hand-built hostile add-item stuffed with every
 *       price channel a naive integration might have invented changes the
 *       charge by NOTHING, asserted against an exact counterfactual.
 *     - `price authority` — the three price types asserted against RESEARCH's
 *       measured table, each at two quantities so the per-unit and per-line
 *       behaviours are distinguishable rather than coincidentally equal.
 *     - `hidden option` — amendment A-1: the wire index is the option's
 *       position in the RECEIVED array. A group whose index-0 option is hidden
 *       is the only fixture shape that can fail on a reindexing regression.
 *
 *   PAO-03  "selections visible in cart, checkout, confirmation, and on the
 *            merchant's WooCommerce order"
 *     - `PDP and purchase` — the panel on the cart drawer line and on the order
 *       confirmation, by group name AND chosen value; then the merchant's own
 *       wc/v3 order carrying PAO's readable meta rows, its `_pao_ids` structured
 *       list and its `_pao_total`.
 *     - The CHECKOUT SUMMARY surface is NOT asserted here and cannot be — see
 *       "THE ONE UNREACHABLE SURFACE" below. That is a recorded environment
 *       gap, not an omission.
 *
 *   PAO-05  "a rejected add-on submission cannot wedge the shopper's checkout"
 *     - `rejection and recovery` — the measured five-step sequence on ONE cart
 *       token, plus the narrow half of the measurement (which codes leave the
 *       session clean), plus the storefront's own attribution of the rejection,
 *       plus the R1 drift guard exercised through the whole stack.
 *
 *   RESEARCH Pitfall 2
 *     - `variable product` — parent-id and variation-id add-items with add-ons.
 *
 * NO SELF-SKIPPING ON A MISSING FIXTURE — a deliberate deviation from the
 * `gift-card.spec.ts` model this file otherwise follows. That spec self-skips
 * when a prerequisite is absent, which is right for a paid gift-card code that
 * CI cannot provision. It is wrong here. The add-on fixtures are committed as a
 * seed, so their absence means the seed regressed — and RESEARCH Pitfall 6 names
 * the exact failure mode: a fixture product that is only reachable BECAUSE it
 * has add-ons will, on losing them, silently skip every assertion and report
 * green. That is the false pass this whole phase exists to avoid. The health
 * probe below therefore gates on ONE thing — the stack being reachable — and
 * `readFixture` THROWS, naming the seed file, for anything else.
 *
 * THE ONE UNREACHABLE SURFACE (measured by plan 14.1-06, re-stated so nobody
 * re-derives it): `/checkout` mints a Stripe Checkout Session during SSR and the
 * local commerce process holds `sk_test_…placeholder`, so it 307s to
 * `/checkout/error?reason=session_creation_failed`. The documented free-cart
 * escape hatch (`e2e-free-100` + `pickup_location:0`) DOES render `/checkout` —
 * but `checkout-page-content.tsx` returns the free-order confirm UI BEFORE the
 * `{checkoutSession ? …}` block that holds `<Cart>`, so the summary column does
 * not exist on the only branch that renders. The summary line IS
 * `LineItemDisplay`, the same component this spec proves live on the
 * confirmation page, and `line-item-display.test.tsx` pins its call site. What
 * is unproven is the surrounding page. A real `sk_test_` key on commerce is the
 * prerequisite; see 14.1-06's deferred item 5.
 *
 * LOCAL-ONLY (HARD RULE): every endpoint is a localhost Docker service —
 * starter (E2E_BASE_URL), WP/WooCommerce :8090, gateway (E2E_GATEWAY_URL).
 * No staging/prod host may appear. This spec places real orders on the LOCAL
 * store, which is what the wedge sequence and the purchase path are.
 *
 * THIS SPEC MUTATES NO PLUGIN STATE. It never activates, deactivates or
 * configures a WordPress plugin and contains no shell escape. The plugin-ABSENT
 * gate is plan 14.1-09's, it is a coordinated action on a shared stack, and it
 * is separately checkpointed.
 *
 * PREREQUISITES (stack up + seeded):
 *   - WordPress + WooCommerce   http://localhost:8090   (WP_BASE_URL)
 *   - WooCommerce Product Add-Ons 8.4.0 ACTIVE
 *   - services/commerce (Go), Hive Gateway, starter (Next)
 *   - docker/wordpress/seed-product-addons.php applied, providing:
 *       glam-booth-package       $1299, 5 groups (1 global first + 4 own),
 *                                required group `Backdrop Design` (1900000003)
 *       glam-booth-all-types     $499, 8 groups, all three price types
 *       glam-booth-variable      variable, 2 parent-level groups
 *       glam-booth-hidden-first  $100, index-0 option hidden (A-1 fixture)
 */

// ---------------------------------------------------------------------------
// Fixtures + constants
// ---------------------------------------------------------------------------

const PACKAGE_SLUG = process.env.HK_ADDONS_PACKAGE_SLUG ?? "glam-booth-package";
const ALL_TYPES_SLUG =
  process.env.HK_ADDONS_ALL_TYPES_SLUG ?? "glam-booth-all-types";

/** The seeded package's group ids. Literals in the seed, so literals here. */
const GLOBAL_GROUP = "1900000010"; // Event Insurance — the category-restricted global
const CHECKBOX_GROUP = "1900000001"; // Add-ons        — free + $10
const GUESTBOOK_GROUP = "1900000002"; // Guest Book    — $50 / $95
const REQUIRED_GROUP = "1900000003"; // Backdrop Design — REQUIRED, free / $25
const TEXT_GROUP = "1900000004"; // Event Message      — custom_text

/** `glam-booth-all-types` — the group carrying all three price types. */
const PRICE_TYPES_GROUP = "1900000103";

/**
 * `glam-booth-all-types` — the `custom_price` group ("Tip the Crew", `min: 5`,
 * no options). The only seeded shape that renders a currency-symbol adornment
 * INSIDE an input, which is what the geometric case below measures.
 */
const CUSTOM_PRICE_GROUP = "1900000108";

const VARIABLE_SLUG =
  process.env.HK_ADDONS_VARIABLE_SLUG ?? "glam-booth-variable";
/** `glam-booth-variable`'s two PARENT-level groups. */
const VARIABLE_CHOICE_GROUP = "1900000301"; // Booth Extras — free / $40
const VARIABLE_TEXT_GROUP = "1900000302"; // Signage Text — custom_text

/**
 * The amendment A-1 fixture: $100 base, one group whose index-0 option is
 * HIDDEN ($5) followed by two visible options at $30 and $70. It is the only
 * seeded shape on which a client that renumbers option indexes against what it
 * RENDERED buys a different option than the shopper clicked.
 */
const HIDDEN_FIRST_SLUG =
  process.env.HK_ADDONS_HIDDEN_FIRST_SLUG ?? "glam-booth-hidden-first";
const HIDDEN_FIRST_GROUP = "1900000401"; // Print Add-Ons (checkbox)

/**
 * The configuration the purchase test submits, as `[group name, chosen value]`.
 * One list, asserted on three surfaces, so the cart drawer, the confirmation
 * page and the merchant's order cannot silently disagree about what was bought.
 * Priced at 10 + 50 + 25 = $85 on a $1299 base.
 */
const CONFIGURED_SELECTIONS = [
  ["Event Insurance", "No cover"],
  ["Add-ons", "Animated Welcome Screen"],
  ["Guest Book Service", "Hardcover Book"],
  ["Backdrop Design", "Sequin Gold"],
  ["Event Message", "Sam & Alex, 12 Dec"],
] as const;

/**
 * Local WooCommerce REST consumer credentials. These are the LOCAL fixture pair
 * minted by `scripts/e2e-ci-stack.sh` (which carries the same literals) and
 * authenticated over plain HTTP by the container-only
 * `mu-plugins/00-local-wc-http-auth.php` shim. They authorise nothing outside
 * the local Docker WordPress.
 */
const WC_CK = process.env.E2E_WC_CONSUMER_KEY ?? "ck_e2e_local_ci";
const WC_CS = process.env.E2E_WC_CONSUMER_SECRET ?? "cs_e2e_local_ci";

/**
 * The local store's non-card payment method. `verify-pao-wedge.sh` uses the
 * same one: it completes `POST /wc/store/v1/checkout` without Stripe, which is
 * what makes the purchase path assertable while commerce holds a placeholder
 * key.
 */
const PAY_METHOD = process.env.PAO_WEDGE_PAYMENT_METHOD ?? "headkit-quote";

const AU_ADDRESS = {
  first_name: "Addon",
  last_name: "Shopper",
  address_1: "1 Test St",
  city: "Melbourne",
  state: "VIC",
  postcode: "3000",
  country: "AU",
  email: "addons.e2e@example.com",
  phone: "0400000000",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Decode the handful of HTML entities WordPress puts on the wire.
 *
 * `&amp;` is decoded LAST and deliberately: decoding it first would turn
 * `&amp;quot;` into `&quot;` and then into a bare quote, i.e. a double decode.
 * The same rejection reaches this spec entity-encoded through one transport and
 * literal through another (measured three separate times in this phase), so
 * every cross-path string comparison runs through this.
 */
function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#8216;|&lsquo;/g, "‘")
    .replace(/&#8217;|&rsquo;/g, "’")
    .replace(/&ndash;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

interface AddonOption {
  label: string;
  price: string;
  price_type: string;
  visibility: number;
}

interface AddonGroup {
  id: string;
  name: string;
  type: string;
  display: string;
  required: number;
  price: string;
  price_type: string;
  description?: string;
  options: AddonOption[];
}

interface AddonFixture {
  id: number;
  name: string;
  slug: string;
  addons: AddonGroup[];
}

/**
 * Read a seeded fixture's product payload, INCLUDING the add-on definitions the
 * theme publishes.
 *
 * THROWS rather than skipping — see the file header. A missing fixture, or a
 * fixture that has lost its `addons`, is a seed regression and must fail the
 * run. Both messages name the seed file so the reader is not left guessing.
 */
async function readFixture(
  api: APIRequestContext,
  slug: string,
): Promise<AddonFixture> {
  const url = `${WP_BASE_URL}/wp-json/headkit/v2/products/slug/${slug}`;
  const res = await api.get(url);
  if (!res.ok()) {
    throw new Error(
      `add-on fixture "${slug}" is not in the local catalogue (HTTP ${res.status()} from ${url}). ` +
        `This is a SEED REGRESSION, not a reason to skip: re-run docker/wordpress/seed-product-addons.php ` +
        `(see its header for the two documented invocations).`,
    );
  }
  const body = (await res.json()) as Partial<AddonFixture>;
  const addons = body.addons;
  if (!Array.isArray(addons) || addons.length === 0) {
    throw new Error(
      `add-on fixture "${slug}" exists but publishes no add-on groups. ` +
        `Either the Product Add-Ons plugin is inactive (this spec is the plugin-PRESENT suite; ` +
        `the plugin-absent gate is plan 14.1-09) or docker/wordpress/seed-product-addons.php ` +
        `has not been applied to this stack. Assertions here would be vacuous, so this fails.`,
    );
  }
  return {
    id: Number(body.id),
    name: String(body.name ?? ""),
    slug,
    addons: addons as AddonGroup[],
  };
}

/**
 * The first variation id of a seeded variable fixture, read from the store
 * rather than hardcoded — variation ids are assigned by WordPress at seed time
 * and are not literals in the seed the way group ids are.
 */
async function firstVariationId(
  api: APIRequestContext,
  slug: string,
): Promise<number> {
  const res = await api.get(
    `${WP_BASE_URL}/wp-json/headkit/v2/products/slug/${slug}`,
  );
  const body = (await res.json()) as { variations?: Array<{ id: number }> };
  const id = body.variations?.[0]?.id;
  if (!id) {
    throw new Error(
      `fixture "${slug}" has no variations — re-run docker/wordpress/seed-product-addons.php`,
    );
  }
  return id;
}

/** Mint a fresh Store API cart session and return its Cart-Token. */
async function mintCartToken(api: APIRequestContext): Promise<string> {
  const boot = await api.get(`${STORE_API}/cart`);
  expect(
    boot.status(),
    `WooCommerce Store API unreachable at ${WP_BASE_URL} — is the local WP stack up?`,
  ).toBe(200);
  const token = boot.headers()["cart-token"] ?? "";
  expect(token, "Store API did not return a Cart-Token header").not.toBe("");
  return token;
}

/** Raw `POST /wc/store/v1/{path}` on a cart token. Returns status + parsed body. */
async function storePost(
  api: APIRequestContext,
  token: string,
  path: string,
  data: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const res = await api.post(`${STORE_API}/${path}`, {
    headers: { "Content-Type": "application/json", "Cart-Token": token },
    data: data as Record<string, unknown>,
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  return { status: res.status(), body };
}

/** `GET /wc/store/v1/cart` on a token. */
async function storeCart(
  api: APIRequestContext,
  token: string,
): Promise<Record<string, unknown>> {
  const res = await api.get(`${STORE_API}/cart`, {
    headers: { "Cart-Token": token },
  });
  expect(res.status(), "Store API cart read failed").toBe(200);
  return (await res.json()) as Record<string, unknown>;
}

interface CartLine {
  id: number;
  name: string;
  quantity: number;
  totals: { line_total: string };
  prices: { price: string };
  extensions?: {
    headkit?: {
      addons_selection?: Array<{
        addon_id: string;
        name: string;
        value: string;
        price: number;
        price_type: string;
        field_type: string;
      }>;
    };
  };
}

/** The last line of a cart payload (add-item responses return the whole cart). */
function lastLine(cart: Record<string, unknown>): CartLine {
  const items = (cart.items ?? []) as CartLine[];
  expect(items.length, "cart carries no line items").toBeGreaterThan(0);
  return items[items.length - 1]!;
}

/**
 * Add one line with add-ons and return the resulting line. Fails loudly with the
 * store's own code when the add is rejected — a bare status assertion here would
 * hide WHICH rejection fired, and this phase's four codes mean different things.
 */
async function addWithAddons(
  api: APIRequestContext,
  token: string,
  productId: number,
  quantity: number,
  addonsConfiguration: Record<string, unknown>,
  extra: Record<string, unknown> = {},
): Promise<CartLine> {
  const { status, body } = await storePost(api, token, "cart/add-item", {
    id: productId,
    quantity,
    addons_configuration: addonsConfiguration,
    ...extra,
  });
  expect(
    status,
    `add-item rejected: ${String(body.code ?? "no code")} — ${String(body.message ?? "")}`,
  ).toBe(201);
  return lastLine(body);
}

interface PriceProbe {
  /** The line as the store returned it, with the add-on applied. */
  line: CartLine;
  /** The product's own per-unit price, measured from an add-on-free line. */
  base: number;
  /** What the add-on added to the LINE, in minor units. */
  contribution: number;
}

/**
 * Measure one add-on's contribution to a line at a given quantity.
 *
 * Both numbers come from the store: a control line with NO add-ons at the same
 * quantity, and the line under test. Nothing here derives a total from the
 * definitions — the expected values in the assertions are RESEARCH's measured
 * table, and the actuals are always a server response.
 *
 * `totals.line_total` is the source of truth, deliberately and not incidentally.
 * `prices.price` is the UNIT price and carries a flat fee already divided by the
 * line quantity, so a comparison written against it under-reports flat-fee lines
 * (RESEARCH §Price Semantics rule 4 and the `raw_prices` asymmetry beneath it).
 */
async function priceProbe(
  api: APIRequestContext,
  productId: number,
  quantity: number,
  addonsConfiguration: Record<string, unknown>,
): Promise<PriceProbe> {
  const controlToken = await mintCartToken(api);
  const control = await addWithAddons(
    api,
    controlToken,
    productId,
    quantity,
    {},
  );
  const token = await mintCartToken(api);
  const line = await addWithAddons(
    api,
    token,
    productId,
    quantity,
    addonsConfiguration,
  );
  const controlTotal = Number(control.totals.line_total);
  return {
    line,
    base: controlTotal / quantity,
    contribution: Number(line.totals.line_total) - controlTotal,
  };
}

/** Place the cart as a real local order. Returns the order id and its key. */
async function placeOrder(
  api: APIRequestContext,
  token: string,
  note: string,
): Promise<{ orderId: string; orderKey: string }> {
  const { status, body } = await storePost(api, token, "checkout", {
    billing_address: AU_ADDRESS,
    shipping_address: AU_ADDRESS,
    payment_method: PAY_METHOD,
    customer_note: note,
  });
  expect(
    [200, 201],
    `POST /checkout returned ${status} (${String(body.code ?? "no code")}) — the purchase did not complete`,
  ).toContain(status);
  const orderId = String(body.order_id ?? "");
  const orderKey = String(body.order_key ?? "");
  expect(Number(orderId), "checkout returned no order_id").toBeGreaterThan(0);
  expect(orderKey, "checkout returned no order_key").toMatch(/^wc_order_/);
  return { orderId, orderKey };
}

interface WcOrderMeta {
  key: string;
  display_key: string;
  value: unknown;
}

/**
 * The merchant's view: the order as `wc/v3` returns it — the same read wp-admin
 * performs. This is the assertion that proves commerce invented no parallel
 * HeadKit meta: the rows a merchant sees are the plugin's own.
 */
async function readWcOrderLineMeta(
  api: APIRequestContext,
  orderId: string,
): Promise<WcOrderMeta[]> {
  const res = await api.get(`${WP_BASE_URL}/wp-json/wc/v3/orders/${orderId}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${WC_CK}:${WC_CS}`).toString("base64")}`,
    },
  });
  expect(
    res.status(),
    `wc/v3 order read failed for ${orderId} — the local consumer key must belong to a WP user with ` +
      `read_private_shop_orders (Admin/Shop-Manager); a 401 woocommerce_rest_cannot_view means it does not`,
  ).toBe(200);
  const order = (await res.json()) as {
    line_items?: Array<{ name: string; meta_data?: WcOrderMeta[] }>;
  };
  const line = order.line_items?.[0];
  expect(line, `order ${orderId} carries no line items`).toBeTruthy();
  return line!.meta_data ?? [];
}

/**
 * The A-1 fixture's own precondition, asserted rather than assumed.
 *
 * If the hidden option ever stops being FIRST, every case in that group silently
 * stops being able to fail — which is precisely the condition
 * `glam-booth-all-types` is in, and the entire reason this fifth fixture exists.
 * A fixture that can no longer discriminate must say so loudly.
 */
function assertHiddenFirstShape(fixture: AddonFixture): AddonGroup {
  const group = fixture.addons.find((g) => g.id === HIDDEN_FIRST_GROUP);
  expect(
    group,
    `fixture "${HIDDEN_FIRST_SLUG}" is missing group ${HIDDEN_FIRST_GROUP} — re-run docker/wordpress/seed-product-addons.php`,
  ).toBeTruthy();
  expect(
    group!.options[0]?.visibility,
    "the index-0 option is no longer hidden — this fixture can no longer catch a reindexing regression",
  ).toBe(0);
  expect(
    group!.options[1]?.visibility,
    "the option after the hidden one is not visible",
  ).toBe(1);
  expect(
    group!.options[2]?.visibility,
    "there is no SECOND visible option — without it the silent mis-buy case cannot exist",
  ).toBe(1);
  return group!;
}

/** The cart drawer (Radix Sheet) — scope every drawer assertion inside it. */
function drawer(page: Page) {
  return page.getByRole("dialog").filter({ hasText: "Your Bag" });
}

/** The add-on selection panel rendered by `addon-details.tsx`. */
function addonPanel(scope: ReturnType<typeof drawer> | Page) {
  return scope
    .locator("div.rounded-\\[3px\\].bg-primary\\/5")
    .filter({ hasText: "Options" });
}

/** Choose an option in a `multiple_choice` group rendered as a Radix Select. */
async function selectAddonOption(
  page: Page,
  addonId: string,
  optionLabel: string | RegExp,
): Promise<void> {
  await page.locator(`#addon-control-${addonId}`).click();
  await page.getByRole("option", { name: optionLabel }).click();
}

/** Read the storefront's own cart token out of the browser context. */
async function cartTokenFromBrowser(page: Page): Promise<string> {
  const cookies = await page.context().cookies();
  const token = cookies.find((c) => c.name === "hk-cart-token")?.value ?? "";
  expect(
    token,
    "the storefront set no hk-cart-token cookie — add-to-cart did not reach the store",
  ).not.toBe("");
  return token;
}

// ---------------------------------------------------------------------------
// PAO-01 / PAO-02 / PAO-03 — render, configure, buy, and see it everywhere
// ---------------------------------------------------------------------------

test.describe("product add-ons — PDP and purchase", () => {
  test.beforeAll(async () => {
    // The ONLY sanctioned skip in this file: a cold machine. Everything else
    // fails, because everything else is a regression.
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway + starter before running the add-on suite",
    );
  });

  test("PAO-01: the PDP renders the merchant's groups in the order the store publishes them, with the global group at its priority position", async ({
    page,
  }) => {
    const api = await request.newContext();
    const fixture = await readFixture(api, PACKAGE_SLUG);
    await api.dispose();

    await page.goto(`${BASE_URL}/products/${PACKAGE_SLUG}`);
    await expect(
      page.getByRole("heading", { level: 1, name: fixture.name }),
    ).toBeVisible({ timeout: 30_000 });

    // Element by element against the endpoint's own order — never a hardcoded
    // list. The array order IS the merge order (14.1-01): `position` is
    // within-group metadata and means nothing here.
    const renderedIds = await page
      .locator('[id^="addon-group-"]')
      .evaluateAll((nodes) =>
        nodes.map((n) => n.id.replace(/^addon-group-/, "")),
      );
    const publishedIds = fixture.addons.map((g) => g.id);
    expect(
      renderedIds,
      "the rendered group order diverges from the order the store published — " +
        "an option index is a position in the array the store sent, so a reordering " +
        "regression here is a mis-buy, not a layout bug",
    ).toEqual(publishedIds);

    // POSITION, not mere presence. The global group lives on a DIFFERENT post
    // and is pulled in by get_product_term_addons() at _priority 5, so it sorts
    // FIRST. An implementation that read `_product_addons` meta directly would
    // omit it; one that appended globals would put it last. Both are caught.
    expect(
      renderedIds.indexOf(GLOBAL_GROUP),
      "the category-restricted global group is not at the position its _priority dictates",
    ).toBe(0);
    expect(
      renderedIds.indexOf(GLOBAL_GROUP),
      "the global group was APPENDED rather than merged at its priority",
    ).not.toBe(renderedIds.length - 1);

    // Merchant descriptions render.
    await expect(page.locator(`#addon-desc-${GUESTBOOK_GROUP}`)).toContainText(
      "We will also provide pens and glue",
    );
    await expect(page.locator(`#addon-desc-${REQUIRED_GROUP}`)).toContainText(
      "Choose from our range of backdrop designs",
    );

    // The required group carries its marker (visually `*`, and `required` for a
    // screen reader — UI-SPEC requires both).
    await expect(page.locator(`#addon-name-${REQUIRED_GROUP}`)).toContainText(
      "required",
    );
    await expect(
      page.locator(`#addon-name-${GUESTBOOK_GROUP}`),
      "an OPTIONAL group is carrying the required marker",
    ).not.toContainText("required");
  });

  test("PAO-01: each option's price suffix uses the format its own price type dictates, and a free option carries none", async ({
    page,
  }) => {
    const api = await request.newContext();
    await readFixture(api, PACKAGE_SLUG);
    await readFixture(api, ALL_TYPES_SLUG);
    await api.dispose();

    // Rendering all three price types as `+$X` misquotes two of them, so all
    // three formats plus the no-suffix case are asserted.
    await page.goto(`${BASE_URL}/products/${PACKAGE_SLUG}`);
    await expect(
      page.locator(`label[for="addon-control-${CHECKBOX_GROUP}-1"]`),
      "flat_fee option suffix",
    ).toContainText("+A$10.00");
    const freeLabel = await page
      .locator(`label[for="addon-control-${CHECKBOX_GROUP}-0"]`)
      .innerText();
    expect(
      freeLabel,
      "a FREE option is advertising a price suffix — a zero price must render no suffix at all",
    ).not.toContain("+");

    await page.goto(`${BASE_URL}/products/${ALL_TYPES_SLUG}`);
    await expect(
      page.locator(`label[for="addon-control-${PRICE_TYPES_GROUP}-0"]`),
      "quantity_based suffix must say `each` — it is charged per unit",
    ).toContainText("+A$20.00 each");
    await expect(
      page.locator(`label[for="addon-control-${PRICE_TYPES_GROUP}-1"]`),
      "percentage_based suffix must be a percentage, not a currency amount",
    ).toContainText("+10%");
    await expect(
      page.locator(`label[for="addon-control-${PRICE_TYPES_GROUP}-2"]`),
      "flat_fee suffix",
    ).toContainText("+A$50.00");
  });

  test("PAO-02/PAO-03: configure the package, buy it, and see the selections on the cart line, the confirmation page and the merchant's order", async ({
    page,
  }) => {
    const api = await request.newContext();
    const fixture = await readFixture(api, PACKAGE_SLUG);

    await page.goto(`${BASE_URL}/products/${PACKAGE_SLUG}`);
    await expect(
      page.getByRole("heading", { level: 1, name: fixture.name }),
    ).toBeVisible({ timeout: 30_000 });

    // One option in each multiple-choice group, one checkbox option, one typed
    // value — the shape UI-SPEC's Surface 1 exists to collect.
    await selectAddonOption(page, GLOBAL_GROUP, /^No cover/);
    await page.locator(`#addon-control-${CHECKBOX_GROUP}-1`).click(); // +$10
    // `\+` and not `\b`: the sibling option is "Hardcover Book With Personalised
    // Logo", so the accessible name must be pinned right up to the price suffix.
    await selectAddonOption(page, GUESTBOOK_GROUP, /^Hardcover Book \+/); // +$50
    await selectAddonOption(page, REQUIRED_GROUP, /^Sequin Gold/); // +$25
    await page
      .locator(`#addon-control-${TEXT_GROUP}`)
      .fill("Sam & Alex, 12 Dec");

    await page
      .getByRole("button", { name: /add to cart/i })
      .first()
      .click();

    // ---- the cart drawer line -------------------------------------------
    await expect(
      drawer(page),
      "the cart drawer did not open after adding a configured package",
    ).toBeVisible({ timeout: 30_000 });
    const panel = addonPanel(drawer(page)).first();
    await expect(
      panel,
      "no add-on panel on the configured cart line",
    ).toBeVisible();
    for (const [group, value] of CONFIGURED_SELECTIONS) {
      await expect(panel, `cart drawer row for "${group}"`).toContainText(
        group,
      );
      await expect(panel, `cart drawer value for "${group}"`).toContainText(
        value,
      );
    }

    // The store's arithmetic, read from the store — 1299 + 10 + 50 + 25.
    const token = await cartTokenFromBrowser(page);
    const cart = await storeCart(api, token);
    const line = lastLine(cart);
    expect(
      line.totals.line_total,
      "the charged line total is not the plugin's figure for the options selected",
    ).toBe("138400");

    // ---- the purchase ----------------------------------------------------
    //
    // Placed through `POST /wc/store/v1/checkout` — the same write the
    // storefront's own checkout performs, and the only route to a completed
    // order while commerce holds a placeholder Stripe key. See the header.
    const { orderId, orderKey } = await placeOrder(
      api,
      token,
      "14.1-07 PAO-03 purchase path",
    );

    // ---- the confirmation page ------------------------------------------
    await page.goto(`${BASE_URL}/checkout/success/${orderId}?key=${orderKey}`);
    const confirmPanel = addonPanel(page).first();
    await expect(
      confirmPanel,
      `no add-on panel on the confirmation page for order ${orderId}`,
    ).toBeVisible({ timeout: 30_000 });
    for (const [group, value] of CONFIGURED_SELECTIONS) {
      await expect(
        confirmPanel,
        `confirmation row for "${group}"`,
      ).toContainText(group);
      await expect(
        confirmPanel,
        `confirmation value for "${group}"`,
      ).toContainText(value);
    }

    // The decode discriminator (14.1-06). Asserting the markup contains
    // `Sam &amp; Alex` passes WITH OR WITHOUT the decode, because React
    // re-escapes the decoded `&`. The real discriminator is the absence of the
    // DOUBLE encoding.
    const confirmHtml = await page.content();
    expect(
      confirmHtml,
      "the shopper's typed value is double-encoded — decodeHtmlEntities is not being applied on the order path",
    ).not.toContain("&amp;amp;");

    // ---- the merchant's order -------------------------------------------
    const meta = await readWcOrderLineMeta(api, orderId);
    const readable = new Map(
      meta
        .filter((m) => !m.key.startsWith("_"))
        .map((m) => [m.key, String(m.value)]),
    );
    for (const [group, value] of [
      // Event Insurance is the CATEGORY-RESTRICTED GLOBAL group, and its chosen
      // option is free. It reaching the merchant's order proves a global group
      // is not merely rendered — it is selected, validated and persisted like
      // any of the product's own.
      ["Event Insurance", "No cover"],
      ["Add-ons", "Animated Welcome Screen"],
      ["Guest Book Service", "Hardcover Book"],
      ["Backdrop Design", "Sequin Gold"],
    ] as const) {
      expect(
        readable.get(group),
        `wp-admin readable meta row for "${group}" — this is what the merchant sees`,
      ).toBe(value);
    }
    expect(
      decodeEntities(readable.get("Event Message") ?? ""),
      "the typed value did not reach the merchant's order",
    ).toBe("Sam & Alex, 12 Dec");

    // The structured id list and the roll-up total — the plugin's OWN meta.
    // Their presence is what proves commerce invented no parallel HeadKit meta.
    const paoIds = meta.find((m) => m.key === "_pao_ids");
    expect(
      paoIds,
      "_pao_ids is absent from the order line — the plugin's structured selection list did not persist",
    ).toBeTruthy();
    // `wc/v3` returns `_pao_ids` already decoded as an array (it is stored as a
    // JSON string in post meta and WooCommerce hydrates it on read). Tolerate
    // both shapes rather than pinning a serialisation detail that is not this
    // phase's contract.
    const parsedIds = (
      typeof paoIds!.value === "string"
        ? JSON.parse(paoIds!.value)
        : paoIds!.value
    ) as Array<{ key: string; value: string; id: string }>;
    expect(
      Array.isArray(parsedIds),
      "_pao_ids is not a list of selections",
    ).toBe(true);
    expect(
      parsedIds.map((entry) => entry.id).sort(),
      "_pao_ids does not carry every selected group's id",
    ).toEqual(
      [
        GLOBAL_GROUP,
        CHECKBOX_GROUP,
        GUESTBOOK_GROUP,
        REQUIRED_GROUP,
        TEXT_GROUP,
      ].sort(),
    );

    const paoTotal = meta.find((m) => m.key === "_pao_total");
    expect(
      paoTotal,
      "_pao_total is absent from the order line — the plugin's add-on roll-up did not persist",
    ).toBeTruthy();
    expect(
      Number(paoTotal!.value),
      "_pao_total is not the sum of the selected add-ons (10 + 50 + 25)",
    ).toBe(85);

    await api.dispose();
  });

  test("PAO-01: the currency prefix and the value the shopper typed never occupy the same space, at either font size", async ({
    page,
  }) => {
    // WHY GEOMETRY AND NOT TEXT: every other assertion in this phase reads the
    // CHARGED amount from the API, where no prefix exists. A correct amount
    // rendered illegibly passes all of them — which is exactly how UAT gap 2
    // reached a human's screenshot instead of a run log.
    await page.goto(`${BASE_URL}/products/${ALL_TYPES_SLUG}`);

    const prefix = page.locator(`#addon-price-prefix-${CUSTOM_PRICE_GROUP}`);
    const input = page.locator(`#addon-control-${CUSTOM_PRICE_GROUP}`);
    await expect(input).toBeVisible({ timeout: 30_000 });

    // THE PRECONDITION, ASSERTED BEFORE ANYTHING ELSE. Written the obvious way
    // this test PASSES against the broken code on a USD store, because a
    // one-character `$` fits the fixed reservation. It must go RED — never
    // skip — when the store is not on a multi-character currency: a skip
    // reports in the run summary as absence of failure, and that is how this
    // class of check quietly stops measuring anything.
    const prefixText = ((await prefix.textContent()) ?? "").trim();
    expect(
      prefixText.length,
      `the rendered currency prefix is "${prefixText}" (${prefixText.length} char) — ` +
        "this assertion is VACUOUS on a single-character currency and is failing " +
        "rather than skipping to say so. The store under test must be on a " +
        "multi-character currency such as AUD (A$), NZD (NZ$), CAD (CA$) or CHF.",
    ).toBeGreaterThan(1);

    // The value from the operator's screenshot, long enough to reach the prefix.
    await input.fill("9.85");

    for (const viewport of [
      {
        name: "375px (Input is text-base/16px below `md`)",
        width: 375,
        height: 812,
      },
      { name: "1280px (Input is md:text-sm/14px)", width: 1280, height: 900 },
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      // ONE evaluate call, so both boxes come from the SAME layout pass.
      const measured = await page.evaluate(
        ({ groupId }) => {
          const span = document.getElementById(`addon-price-prefix-${groupId}`);
          const field = document.getElementById(`addon-control-${groupId}`);
          if (!span || !field) return null;
          const style = getComputedStyle(field);
          const box = field.getBoundingClientRect();
          return {
            prefixRight: span.getBoundingClientRect().right,
            // The value's first glyph starts at the CONTENT box, not the border
            // box: border + padding both sit to its left.
            contentLeft:
              box.left +
              parseFloat(style.borderLeftWidth) +
              parseFloat(style.paddingLeft),
            prefixText: (span.textContent ?? "").trim(),
            fontSize: style.fontSize,
          };
        },
        { groupId: CUSTOM_PRICE_GROUP },
      );

      expect(
        measured,
        "the prefix span or the custom_price input is absent",
      ).not.toBeNull();
      const {
        prefixRight,
        contentLeft,
        prefixText: read,
        fontSize,
      } = measured!;
      const clearance = contentLeft - prefixRight;

      // 2px, not 0: touching is not legible either, and a zero-clearance gate
      // would accept a fix that merely stopped the two boxes from strictly
      // intersecting. The message prints both edges so a future red is
      // diagnosable from the run log alone.
      expect(
        clearance,
        `${viewport.name}: the currency prefix "${read}" runs into the typed value — ` +
          `prefix right edge ${prefixRight.toFixed(2)}px, value content-box left edge ` +
          `${contentLeft.toFixed(2)}px, clearance ${clearance.toFixed(2)}px ` +
          `(input font-size ${fontSize}). The room reserved for the prefix must be ` +
          "derived from the prefix, not fixed.",
      ).toBeGreaterThanOrEqual(2);
    }
  });
});

// ---------------------------------------------------------------------------
// PAO-02 — price authority
// ---------------------------------------------------------------------------

test.describe("product add-ons — price authority", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway + starter before running the add-on suite",
    );
  });

  test("PAO-02: a hostile add-item carrying every price channel a naive integration might have invented charges exactly what the honest one does", async () => {
    const api = await request.newContext();
    const fixture = await readFixture(api, PACKAGE_SLUG);

    // THE COUNTERFACTUAL, and it is what makes this assertion mean something.
    // With only the free required group the line is $1299. Adding the $95
    // Guest Book option must move it to $1394. So if ANY client-supplied price
    // were honoured for that option the line would come back at $1299 — a
    // different, observable number, not a subtle one.
    const cheapToken = await mintCartToken(api);
    const cheapLine = await addWithAddons(api, cheapToken, fixture.id, 1, {
      [REQUIRED_GROUP]: 0,
    });
    expect(
      cheapLine.totals.line_total,
      "counterfactual baseline moved — the fixture's prices have changed and this assertion no longer discriminates",
    ).toBe("129900");

    const honestToken = await mintCartToken(api);
    const honestLine = await addWithAddons(api, honestToken, fixture.id, 1, {
      [REQUIRED_GROUP]: 0,
      [GUESTBOOK_GROUP]: 1,
    });
    expect(honestLine.totals.line_total).toBe("139400");

    // The hostile body. Posted DIRECTLY to the Store API, bypassing commerce
    // entirely, so this measures the store's own resistance rather than
    // commerce's shape guard (which 14.1-04 pins separately, pre-HTTP).
    //
    // The point being demonstrated is STRUCTURAL: the wire contract has no
    // field a price could travel in. So this asserts an EXACT total, not
    // `> 0` — if the contract ever gains such a field, or the plugin ever
    // starts honouring one of these keys, this goes red loudly instead of
    // shrugging.
    const hostileToken = await mintCartToken(api);
    const hostileLine = await addWithAddons(
      api,
      hostileToken,
      fixture.id,
      1,
      { [REQUIRED_GROUP]: 0, [GUESTBOOK_GROUP]: 1 },
      {
        price: 1,
        line_total: "1",
        addons_price: 0,
        addons_prices: { [GUESTBOOK_GROUP]: 0 },
        addons: { [GUESTBOOK_GROUP]: { price: 0 } },
      },
    );
    expect(
      hostileLine.totals.line_total,
      "a client-supplied price MOVED THE CHARGE — the wire contract has grown a field a price can travel in",
    ).toBe("139400");
    expect(
      hostileLine.totals.line_total,
      "the tampered line was charged the cheap counterfactual",
    ).not.toBe("129900");

    // The echoed selection carries the DEFINITION's price, not the request's.
    const echoed = hostileLine.extensions?.headkit?.addons_selection ?? [];
    const guestBook = echoed.find((s) => s.addon_id === GUESTBOOK_GROUP);
    expect(
      guestBook?.value,
      "the tampered request bought a different option than the index it sent",
    ).toBe("Hardcover Book With Personalised Logo");
    expect(
      guestBook?.price,
      "the echoed price is the client's, not the store's definition",
    ).toBe(95);

    await api.dispose();
  });

  test("PAO-02: a flat_fee option contributes the SAME amount at quantity 1 and quantity 3 — it is charged once per line", async () => {
    const api = await request.newContext();
    const fixture = await readFixture(api, ALL_TYPES_SLUG);

    // RESEARCH §Price Semantics rule 3: flat_fee divides the option price by the
    // line quantity and adds that to the UNIT price, so the fee lands once per
    // line. Re-measured on this fixture 2026-08-14: $499 base, $50 fee.
    const one = await priceProbe(api, fixture.id, 1, {
      [PRICE_TYPES_GROUP]: [2],
    });
    const three = await priceProbe(api, fixture.id, 3, {
      [PRICE_TYPES_GROUP]: [2],
    });

    expect(one.contribution, "flat_fee contribution at quantity 1").toBe(5000);
    expect(three.contribution, "flat_fee contribution at quantity 3").toBe(
      5000,
    );
    expect(
      three.contribution,
      "a flat fee multiplied with quantity — it is charged once per LINE, not per unit",
    ).toBe(one.contribution);

    // The reporting trap, asserted rather than only commented. `prices.price` is
    // the UNIT price and therefore carries the fee DIVIDED by quantity
    // (54900 at qty 1, 51567 at qty 3 — measured). An assertion written against
    // it would silently mis-report a flat-fee line at any quantity above one,
    // which is why every assertion here reads `totals.line_total`.
    expect(
      three.line.prices.price,
      "prices.price is quantity-invariant for a flat fee — the per-line division is not being reported, so the trap this pin exists for has changed shape",
    ).not.toBe(one.line.prices.price);
  });

  test("PAO-02: a quantity_based option's contribution TRIPLES between quantity 1 and quantity 3 — it folds into the unit price", async () => {
    const api = await request.newContext();
    const fixture = await readFixture(api, ALL_TYPES_SLUG);

    // RESEARCH §Price Semantics rule 1: $20 quantity_based → $20 per unit.
    const one = await priceProbe(api, fixture.id, 1, {
      [PRICE_TYPES_GROUP]: [0],
    });
    const three = await priceProbe(api, fixture.id, 3, {
      [PRICE_TYPES_GROUP]: [0],
    });

    expect(one.contribution, "quantity_based contribution at quantity 1").toBe(
      2000,
    );
    expect(
      three.contribution,
      "quantity_based contribution at quantity 3",
    ).toBe(6000);
    expect(
      three.contribution,
      "a quantity_based option did not multiply with the line quantity",
    ).toBe(one.contribution * 3);
  });

  test("PAO-02: a percentage_based option contributes the base price times the percentage, per unit", async () => {
    const api = await request.newContext();
    const fixture = await readFixture(api, ALL_TYPES_SLUG);

    // RESEARCH §Price Semantics rule 2: base x pct/100, added to the UNIT price.
    // 10% of $499 = $49.90 → 4990 minor units per unit.
    const one = await priceProbe(api, fixture.id, 1, {
      [PRICE_TYPES_GROUP]: [1],
    });
    const three = await priceProbe(api, fixture.id, 3, {
      [PRICE_TYPES_GROUP]: [1],
    });

    const basePerUnit = Number(one.base);
    const pct = Number(
      fixture.addons.find((g) => g.id === PRICE_TYPES_GROUP)?.options[1]?.price,
    );
    expect(pct, "the percentage_based fixture option's percentage").toBe(10);

    expect(
      one.contribution,
      "percentage_based contribution at quantity 1 is not base x pct/100",
    ).toBe(Math.round((basePerUnit * pct) / 100));
    expect(one.contribution).toBe(4990);
    expect(
      three.contribution,
      "percentage_based is a PER-UNIT contribution, so it multiplies with quantity",
    ).toBe(4990 * 3);
  });
});

// ---------------------------------------------------------------------------
// PAO-05 — rejection, recovery and the R1 drift guard
// ---------------------------------------------------------------------------

test.describe("product add-ons — rejection and recovery", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway + starter before running the add-on suite",
    );
  });

  test("PAO-05: one rejected add-item no longer wedges the cart session — five steps, one token, ending in a checkout WRITE", async () => {
    const api = await request.newContext();
    const fixture = await readFixture(api, PACKAGE_SLUG);

    // The defect: PAO rejects a required-field omission by calling
    // wc_add_notice() and THEN throwing. Core's CartController::validate_cart()
    // reads that notice into a WP_Error and then RESTORES the session bag it
    // snapshotted (`CartController.php:511,527,530`), so the notice never
    // drains. From that moment every cart read carries a phantom error and
    // every checkout write 409s, for the life of the cart session. One shopper
    // mistake wedged checkout permanently.
    //
    // ONE TOKEN throughout. Minting a fresh one between steps would test
    // nothing — the whole defect is that the poison PERSISTS on the session.
    const token = await mintCartToken(api);

    // Step 1 — the poisoning rejection. Only this code poisons; the two
    // woocommerce_pao_invalid_addon_* codes throw from the add-to-cart DATA
    // filter, before any notice is written (asserted in the next test).
    const rejected = await storePost(api, token, "cart/add-item", {
      id: fixture.id,
      quantity: 1,
      addons_configuration: { [CHECKBOX_GROUP]: [0] }, // required group omitted
    });
    expect(
      rejected.status,
      "the required-field omission was not rejected — the fixture's required group has changed and this sequence no longer reproduces the wedge",
    ).toBe(400);
    expect(rejected.body.code).toBe(
      "woocommerce_rest_cart_invalid_product_addons",
    );

    // Step 2 — THE assertion. The very next cart read must be clean.
    const afterRejection = await storeCart(api, token);
    expect(
      afterRejection.errors ?? [],
      "the cart read immediately after the rejection carries a phantom error. THIS IS THE WEDGE — the session notice never drained",
    ).toEqual([]);

    // Step 3 — a valid add on the SAME, previously-rejected token.
    const accepted = await storePost(api, token, "cart/add-item", {
      id: fixture.id,
      quantity: 1,
      addons_configuration: { [CHECKBOX_GROUP]: [0], [REQUIRED_GROUP]: 0 },
    });
    expect(accepted.status, "the corrected add-item was rejected").toBe(201);
    expect(
      accepted.body.errors ?? [],
      "the SUCCESSFUL add still returns a phantom error",
    ).toEqual([]);

    // Step 4 — the cart is still clean after the successful add.
    const afterAccept = await storeCart(api, token);
    expect(afterAccept.errors ?? []).toEqual([]);

    // Step 5 — the VERB PIN, and it is load-bearing rather than stylistic.
    // `GET /checkout` returns 200 on a poisoned cart (measured); only the WRITE
    // 409s. A regression written against the read would pass while the defect
    // is 100% present — which is this project's characteristic failure mode,
    // not a hypothetical one.
    const checkout = await storePost(api, token, "checkout", {
      billing_address: AU_ADDRESS,
      shipping_address: AU_ADDRESS,
      payment_method: PAY_METHOD,
      customer_note: "14.1-07 PAO-05 wedge regression",
    });
    expect(
      checkout.status,
      `POST /checkout returned ${checkout.status} ${String(checkout.body.code ?? "")} — the session is STILL WEDGED`,
    ).not.toBe(409);
    expect(
      [200, 201],
      `POST /checkout returned ${checkout.status} (${String(checkout.body.code ?? "no code")}). Not a 409, so not this defect — but not a completed checkout either`,
    ).toContain(checkout.status);
    expect(Number(checkout.body.order_id ?? 0)).toBeGreaterThan(0);

    await api.dispose();
  });

  test("PAO-05: the two stale-client rejections each return their OWN code and leave the session clean", async () => {
    const api = await request.newContext();
    const fixture = await readFixture(api, PACKAGE_SLUG);

    // This is the NARROW half of the measurement, and it is what makes the
    // wedge regression cheap: of PAO's rejection codes only
    // woocommerce_rest_cart_invalid_product_addons poisons. If the plugin ever
    // moves one of these two to the notice-writing path, this goes red and the
    // guard's blast radius has to be re-derived — which is exactly the moment
    // someone needs to know.
    for (const [label, config, expectedCode] of [
      [
        "an add-on id the store does not have",
        { [REQUIRED_GROUP]: 0, "9999999999": 0 },
        "woocommerce_pao_invalid_addon_id",
      ],
      [
        "an option index outside the group's range",
        { [REQUIRED_GROUP]: 99 },
        "woocommerce_pao_invalid_addon_value",
      ],
    ] as const) {
      const token = await mintCartToken(api);
      const res = await storePost(api, token, "cart/add-item", {
        id: fixture.id,
        quantity: 1,
        addons_configuration: config,
      });
      expect(res.status, `${label}: HTTP status`).toBe(400);
      expect(
        res.body.code,
        `${label}: each rejection must carry its OWN code — a collapsed code makes the storefront unable to tell a stale page from a shopper mistake`,
      ).toBe(expectedCode);

      const cart = await storeCart(api, token);
      expect(
        cart.errors ?? [],
        `${label}: the session was POISONED by a code that is not supposed to poison`,
      ).toEqual([]);
    }

    await api.dispose();
  });

  test("PAO-05: the storefront renders the store's own message against the group it names, not as a generic failure", async ({
    page,
  }) => {
    const api = await request.newContext();
    const fixture = await readFixture(api, PACKAGE_SLUG);

    await page.goto(`${BASE_URL}/products/${PACKAGE_SLUG}`);
    await expect(
      page.getByRole("heading", { level: 1, name: fixture.name }),
    ).toBeVisible({ timeout: 30_000 });

    // Everything EXCEPT the required group. The client deliberately performs no
    // required-field check of its own (D-14.1-02, and V1's ported validator is
    // what this phase exists to not repeat), so the CTA is enabled and the
    // submit reaches the store.
    await page.locator(`#addon-control-${CHECKBOX_GROUP}-1`).click();
    await expect(
      page.getByRole("button", { name: /add to cart/i }).first(),
      "the add-to-cart button is disabled with a required group empty — the client has grown a validator it must not have",
    ).toBeEnabled();
    await page
      .getByRole("button", { name: /add to cart/i })
      .first()
      .click();

    // Attributed to the group by NAME (the required-field message carries no
    // add-on id — RESEARCH measured that, so nothing may mine one out of it).
    const errorNode = page.locator(`#addon-error-${REQUIRED_GROUP}`);
    await expect(
      errorNode,
      "the rejection did not land against the group the store named",
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      page.locator(
        `#addon-group-${REQUIRED_GROUP} #addon-error-${REQUIRED_GROUP}`,
      ),
      "the message rendered outside its own group's container — that is a generic banner, not attribution",
    ).toHaveCount(1);

    const rendered = (await errorNode.innerText()).trim();

    // BOTH PATHS, ENTITY-DECODED. The identical message arrives encoded through
    // one transport and literal through the other, so a raw string comparison
    // fails on one of them — measured three separate times in this phase.
    const token = await mintCartToken(api);
    const wire = await storePost(api, token, "cart/add-item", {
      id: fixture.id,
      quantity: 1,
      addons_configuration: { [CHECKBOX_GROUP]: [1] },
    });
    const wireMessage = String(wire.body.message ?? "");
    expect(
      decodeEntities(rendered),
      "the storefront is not showing the store's own sentence for this rejection",
    ).toBe(decodeEntities(wireMessage));

    // The discriminator. Without it the comparison above could pass with both
    // sides still encoded: what a shopper must never see is a raw entity.
    expect(
      rendered,
      "an HTML entity reached the shopper — decodeHtmlEntities is not being applied to the rejection message",
    ).not.toMatch(/&(quot|amp|#0?39|lt|gt);/);
    expect(
      rendered,
      "the group name is not quoted in the rendered message — the store's sentence has been rewritten",
    ).toContain('"Backdrop Design"');

    await api.dispose();
  });

  test("R1: an option-index drift is rejected with its own code, and the same selection with a matching label succeeds", async () => {
    const api = await request.newContext();
    const fixture = await readFixture(api, PACKAGE_SLUG);
    const required = fixture.addons.find((g) => g.id === REQUIRED_GROUP)!;
    const labelAtZero = required.options[0]!.label; // "Classic White"
    const labelAtOne = required.options[1]!.label; // "Sequin Gold"

    // This is the ONLY place plan 14.1-02's R1 guard is exercised through the
    // whole stack. The guard runs at `woocommerce_store_api_add_to_cart_data`
    // priority 9 — the last moment the 0-based index still exists, because
    // PAO's own callback at 10 resolves it to a label slug and discards it.
    const driftToken = await mintCartToken(api);
    const drifted = await storePost(api, driftToken, "cart/add-item", {
      id: fixture.id,
      quantity: 1,
      addons_configuration: { [REQUIRED_GROUP]: 0 },
      // The client claims index 0 is the SECOND option's label. It is not.
      headkit_addons_verify: { [REQUIRED_GROUP]: { "0": labelAtOne } },
    });
    expect(drifted.status, "a drifted selection was accepted").toBe(409);
    expect(drifted.body.code).toBe("headkit_addon_option_drift");
    expect(
      decodeEntities(String(drifted.body.message ?? "")),
      "the drift message is not the shopper-facing sentence",
    ).toBe(
      "This product's options changed while you were choosing. Please review your selection.",
    );
    // T-14.1-02-05: the message must name neither label, so it leaks no
    // catalogue internals back to a client that guessed.
    expect(String(drifted.body.message ?? "")).not.toContain(labelAtOne);
    expect(String(drifted.body.message ?? "")).not.toContain(labelAtZero);
    expect(
      (await storeCart(api, driftToken)).errors ?? [],
      "the drift rejection poisoned the session",
    ).toEqual([]);

    // The same selection with the label the store actually holds at that index.
    const okToken = await mintCartToken(api);
    const accepted = await storePost(api, okToken, "cart/add-item", {
      id: fixture.id,
      quantity: 1,
      addons_configuration: { [REQUIRED_GROUP]: 0 },
      headkit_addons_verify: { [REQUIRED_GROUP]: { "0": labelAtZero } },
    });
    expect(
      accepted.status,
      "an HONEST verify map was rejected as drift — the guard is over-reaching",
    ).toBe(201);

    // Omitting the map is safe and supported: the guard degrades to inert, which
    // is what let 14.1-02 ship ahead of the storefront.
    const bareToken = await mintCartToken(api);
    const bare = await storePost(api, bareToken, "cart/add-item", {
      id: fixture.id,
      quantity: 1,
      addons_configuration: { [REQUIRED_GROUP]: 0 },
    });
    expect(
      bare.status,
      "an add-item WITHOUT headkit_addons_verify was rejected — the guard is no longer inert when the key is absent",
    ).toBe(201);

    await api.dispose();
  });
});

// ---------------------------------------------------------------------------
// RESEARCH Pitfall 2 — variable products
// ---------------------------------------------------------------------------

test.describe("product add-ons — variable product", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway + starter before running the add-on suite",
    );
  });

  test("Pitfall 2 / A1: parent-id and variation-id add-items with add-ons resolve IDENTICALLY", async () => {
    const api = await request.newContext();
    const fixture = await readFixture(api, VARIABLE_SLUG);
    const variationId = await firstVariationId(api, VARIABLE_SLUG);

    // RESEARCH predicted a divergence here: PAO's data filter reads the RAW
    // request id (`cart.php:73`) while its validator runs on the RESOLVED
    // variation (`cart.php:177`), and `get_product_addons()` derives `field_name`
    // from whichever id it was handed. The mechanism is verified on both sides
    // of the source; the SYMPTOM was assumed.
    //
    // Plan 14.1-02 MEASURED it and the symptom does not manifest, because
    // `addons_configuration` is keyed by add-on ID, not by `field_name` —
    // `field_name` never enters the Store API write path at all. So the
    // assertion encoded here is the IDENTITY, not a divergence. If a future
    // plugin release reintroduces the divergence this goes red, which is the
    // whole reason a variable-product case belongs in this suite: Pebblr sells
    // simple products only, so there is no other place it would ever be caught.
    const config = {
      [VARIABLE_CHOICE_GROUP]: 1, // Props box, +$40
      [VARIABLE_TEXT_GROUP]: "Team Nova",
    };
    const attributes = [{ attribute: "Booth Size", value: "Standard" }];

    const parentToken = await mintCartToken(api);
    const viaParent = await addWithAddons(
      api,
      parentToken,
      fixture.id,
      1,
      config,
      { variation: attributes },
    );
    const variationToken = await mintCartToken(api);
    const viaVariation = await addWithAddons(
      api,
      variationToken,
      variationId,
      1,
      config,
    );

    expect(
      viaParent.id,
      "the parent-id path resolved a different line item than the variation-id path",
    ).toBe(viaVariation.id);
    expect(viaParent.id, "the line item is not the variation").toBe(
      variationId,
    );
    expect(
      viaParent.totals.line_total,
      "the two id paths were charged differently",
    ).toBe(viaVariation.totals.line_total);
    expect(viaParent.totals.line_total).toBe("153900"); // 1499 base + 40
    expect(
      viaParent.extensions?.headkit?.addons_selection,
      "the two id paths echoed different selections — RESEARCH Pitfall 2's predicted divergence has appeared",
    ).toEqual(viaVariation.extensions?.headkit?.addons_selection);

    await api.dispose();
  });

  test("PAO-03: a variable product with add-ons can be bought, and the selections reach the merchant's order", async () => {
    const api = await request.newContext();
    await readFixture(api, VARIABLE_SLUG);
    const variationId = await firstVariationId(api, VARIABLE_SLUG);

    const token = await mintCartToken(api);
    const line = await addWithAddons(api, token, variationId, 1, {
      [VARIABLE_CHOICE_GROUP]: 1,
      [VARIABLE_TEXT_GROUP]: "Team Nova",
    });
    expect(line.totals.line_total).toBe("153900");

    const { orderId } = await placeOrder(
      api,
      token,
      "14.1-07 variable-product purchase",
    );
    const meta = await readWcOrderLineMeta(api, orderId);
    const readable = new Map(
      meta
        .filter((m) => !m.key.startsWith("_"))
        .map((m) => [m.key, String(m.value)]),
    );
    expect(
      readable.get("Booth Extras"),
      "a variable product's add-on selection did not reach the order",
    ).toBe("Props box");
    expect(readable.get("Signage Text")).toBe("Team Nova");
    expect(
      meta.find((m) => m.key === "_pao_ids"),
      "_pao_ids is absent on a variable-product order line",
    ).toBeTruthy();

    await api.dispose();
  });
});

// ---------------------------------------------------------------------------
// Amendment A-1 — a hidden option at index 0
// ---------------------------------------------------------------------------

test.describe("product add-ons — hidden option at index 0", () => {
  test.beforeAll(async () => {
    test.skip(
      !(await stackIsUp()),
      "local stack down — bring up WP :8090 + gateway + starter before running the add-on suite",
    );
  });

  test("A-1: the hidden index-0 option never renders, and the visible options keep their RECEIVED wire indexes", async ({
    page,
  }) => {
    const api = await request.newContext();
    const fixture = await readFixture(api, HIDDEN_FIRST_SLUG);
    const group = assertHiddenFirstShape(fixture);
    const hiddenOption = group.options[0]!; // Legacy Matte (retired), $5

    await page.goto(`${BASE_URL}/products/${HIDDEN_FIRST_SLUG}`);
    await expect(
      page.getByRole("heading", { level: 1, name: fixture.name }),
    ).toBeVisible({ timeout: 30_000 });

    // The hidden option is suppressed at RENDER and nowhere earlier. One control
    // per VISIBLE option, and each control's DOM id carries its RECEIVED index —
    // so `-0` must not exist while `-1` and `-2` must. A subset-numbered
    // implementation would produce `-0` and `-1` and fail here.
    await expect(
      page.locator(`#addon-control-${HIDDEN_FIRST_GROUP}-0`),
      `"${hiddenOption.label}" is rendered — a visibility:0 option reached a shopper`,
    ).toHaveCount(0);
    await expect(
      page.locator(`#addon-control-${HIDDEN_FIRST_GROUP}-1`),
      "the first VISIBLE option is not carrying its received index (1) — the controls have been renumbered against the rendered subset",
    ).toHaveCount(1);
    await expect(
      page.locator(`#addon-control-${HIDDEN_FIRST_GROUP}-2`),
      "the second visible option is not carrying its received index (2)",
    ).toHaveCount(1);
    await expect(
      page.locator(`#addon-group-${HIDDEN_FIRST_GROUP}`),
      "the hidden option's label is on the page",
    ).not.toContainText(hiddenOption.label);

    await api.dispose();
  });

  // Both visible options, because they fail DIFFERENTLY under the same defect,
  // and only one of the two failures is silent.
  //
  //   "Gloss Finish"    received index 1 -> a reindexed encoder sends 0, which
  //                     is the hidden option. PAO refuses to sell it outright
  //                     ("… is not available for purchase."), so the shopper
  //                     gets a rejection: wrong, but LOUD.
  //   "Metallic Finish" received index 2 -> a reindexed encoder sends 1, which
  //                     is Gloss Finish: visible, sellable, and $40 cheaper.
  //                     Nothing server-side can object. This is the SILENT
  //                     mis-buy amendment A-1 exists to prevent, and the charged
  //                     total is its only detector anywhere in the stack.
  for (const { label, receivedIndex, expectedTotal, reindexedTotal } of [
    {
      label: "Gloss Finish",
      receivedIndex: 1,
      expectedTotal: "13000", // $100 base + $30
      reindexedTotal: "10500", // what buying the hidden $5 option would cost
    },
    {
      label: "Metallic Finish",
      receivedIndex: 2,
      expectedTotal: "17000", // $100 base + $70
      reindexedTotal: "13000", // silently charged for Gloss Finish instead
    },
  ]) {
    test(`A-1: picking "${label}" buys THAT option and charges THAT price`, async ({
      page,
    }) => {
      const api = await request.newContext();
      const fixture = await readFixture(api, HIDDEN_FIRST_SLUG);
      const group = assertHiddenFirstShape(fixture);
      const option = group.options[receivedIndex];
      expect(
        option?.label,
        `the fixture's option at received index ${receivedIndex} is no longer "${label}"`,
      ).toBe(label);

      await page.goto(`${BASE_URL}/products/${HIDDEN_FIRST_SLUG}`);
      await expect(
        page.getByRole("heading", { level: 1, name: fixture.name }),
      ).toBeVisible({ timeout: 30_000 });

      // Select BY ACCESSIBLE NAME — what a shopper does, and load-bearing here:
      // selecting by the index-encoded DOM id would FOLLOW a renumbering and
      // mask the very defect this case exists to catch.
      const control = page.getByRole("checkbox", { name: label, exact: false });
      await control.click();
      await expect(control, `"${label}" did not become selected`).toBeChecked();

      await page
        .getByRole("button", { name: /add to cart/i })
        .first()
        .click();
      await expect(
        drawer(page),
        `add-to-cart did not complete for "${label}" — the store rejected the selection`,
      ).toBeVisible({ timeout: 30_000 });

      const token = await cartTokenFromBrowser(page);
      const line = lastLine(await storeCart(api, token));
      const chosen = (line.extensions?.headkit?.addons_selection ?? []).find(
        (s) => s.addon_id === HIDDEN_FIRST_GROUP,
      );

      // BOTH halves, and both are needed. The label alone is not enough: it is
      // derived SERVER-SIDE from the index, so a correct label with a wrong
      // index cannot occur — but a wrong index with a perfectly plausible label
      // absolutely can, and the total is what the shopper actually pays.
      expect(
        chosen?.value,
        `the store priced a DIFFERENT option than the shopper clicked — expected "${label}" (received index ${receivedIndex})`,
      ).toBe(label);
      expect(
        line.totals.line_total,
        `the CHARGED total is not "${label}"'s price on the $100 base`,
      ).toBe(expectedTotal);
      // The explicit counterfactual, so the number above is not a magic
      // constant: this is what a subset-numbered encoder would have charged.
      expect(
        line.totals.line_total,
        `the shopper was charged ${reindexedTotal} — the wire index was taken from the RENDERED subset instead of the received array (amendment A-1)`,
      ).not.toBe(reindexedTotal);

      await api.dispose();
    });
  }
});
