import { decodeHtmlEntities, formatPrice, getFloatVal } from "@/lib/utils";

/**
 * Pure helpers for the WooCommerce Product Add-Ons PDP form.
 *
 * The one rule the whole module serves: **the store's definition is the only
 * definition — the client echoes, it never decides.** Nothing here validates a
 * selection, resolves a price the shopper will be charged, or reorders anything
 * the store sent. The extension does all three, server-side, and 14.1-04 proved
 * that a request carrying an invented price changes the charge by nothing.
 *
 * Two properties are load-bearing:
 *
 *  1. **A wire index is a position in the RECEIVED options array**, never a
 *     position among the options that were rendered. 14.1-01 measured that
 *     `WC_Product_Addons_Helper::get_product_addons()` publishes options whose
 *     `visibility` flag is 0 instead of stripping them, and PAO's own validator
 *     indexes into that same array (`class-wc-product-addons-cart.php:96-114`).
 *     Hiding one at render is cosmetic; renumbering around it is a mis-buy —
 *     the shopper is charged for a different option than the one they clicked
 *     (risk R1). {@link visibleAddonOptions} is the only sanctioned way to
 *     iterate a group for display precisely because it carries the received
 *     index with each option it yields.
 *
 *  2. **No client-computed price can reach the request.**
 *     {@link estimateAddonsTotal} exists for the shopper's eyes only and its
 *     output is never placed in a payload; {@link buildAddonsConfiguration} has
 *     no field a price could travel in, by construction. A unit test asserts
 *     that rather than trusting it.
 *
 * No React, no side effects. Imports are limited to the formatters that already
 * exist in `@/lib/utils` — this phase's dependency budget is zero.
 */

/** The extension's shipped field types. `heading` is display-only; `file_upload` is out of scope (D-14.1-05). */
export const ADDON_TYPE = {
  Checkbox: "checkbox",
  MultipleChoice: "multiple_choice",
  CustomText: "custom_text",
  CustomTextarea: "custom_textarea",
  Datepicker: "datepicker",
  InputMultiplier: "input_multiplier",
  CustomPrice: "custom_price",
  Heading: "heading",
  FileUpload: "file_upload",
} as const;

/** How a price applies. Rendering all three the same way misquotes two of them. */
export const ADDON_PRICE_TYPE = {
  FlatFee: "flat_fee",
  QuantityBased: "quantity_based",
  PercentageBased: "percentage_based",
} as const;

/**
 * The subset of `ProductAddonOption` this module reads. Declared structurally
 * so the SDK type satisfies it without an import that would drag generated
 * GraphQL types into every unit-test fixture.
 */
export type AddonOptionShape = {
  readonly label: string;
  readonly price: string;
  readonly priceType: string;
  readonly visibility: number;
};

/** The subset of `ProductAddon` this module reads. `ProductAddon` satisfies it. */
export type AddonGroupShape = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  /** Group-level price for the option-less types; empty for option-bearing ones. */
  readonly price: string;
  readonly priceType: string;
  readonly options: readonly AddonOptionShape[];
};

/**
 * The shopper's in-progress choices, keyed by add-on group id.
 *
 * This is deliberately the same shape the wire wants, so there is no model to
 * translate: an option index (or list of them) for the choice types, and the
 * raw control value for the free-input types. Numeric types hold whatever the
 * `<input>` produced — a string — and are coerced by the encoder, which derives
 * every value's shape from the group's own `type` and never from the shape the
 * value happens to have.
 */
export type AddonSelectionValue = number | number[] | string;
export type AddonSelection = Record<string, AddonSelectionValue>;

/** `addons_configuration` as PAO's Store API filter expects it. */
export type AddonsConfiguration = Record<string, number | number[] | string>;

/** `headkit_addons_verify` — `{ addonId: { index: label } }` for selected options only. */
export type AddonsVerify = Record<string, Record<string, string>>;

/**
 * An option paired with its position in the array the store sent.
 *
 * Generic over the option so a caller that needs render-only fields this module
 * never reads — the swatch `image`, say — keeps them, rather than having to
 * re-find the option by an index it was just handed.
 */
export type RenderableAddonOption<
  T extends AddonOptionShape = AddonOptionShape,
> = {
  readonly option: T;
  readonly index: number;
};

/**
 * The options a group should render, each carrying its **received** index.
 *
 * Options the merchant hid (`visibility: 0`) are suppressed here — that is the
 * only place in the stack where hiding happens, because 14.1-01 established
 * that stripping them any earlier shifts every later index away from the one
 * PAO validates and charges against. Callers must put `index` on the wire, not
 * the position within the returned array.
 */
export function visibleAddonOptions<T extends AddonOptionShape>(group: {
  readonly options: readonly T[];
}): Array<RenderableAddonOption<T>> {
  const renderable: Array<RenderableAddonOption<T>> = [];
  group.options.forEach((option, index) => {
    if (option.visibility === 0) return;
    renderable.push({ option, index });
  });
  return renderable;
}

/**
 * True when the product carries a group this storefront cannot accept online (D-14.1-05).
 *
 * Accepts a missing list, and that tolerance is load-bearing rather than defensive
 * habit. The schema types the field `[ProductAddon!]!`, so commerce guarantees `[]`
 * — but only a commerce reading a theme that PUBLISHES the key. Against a store on
 * an older theme the key is absent entirely and the SDK yields `undefined`. That is
 * every store until its theme is deployed, so the un-guarded form did not degrade to
 * "no add-ons" (D-14.1-04); it threw during prerender and failed the whole build.
 */
export function hasBlockingAddon(
  addons: readonly AddonGroupShape[] | null | undefined,
): boolean {
  return (addons ?? []).some((group) => group.type === ADDON_TYPE.FileUpload);
}

/** True for the types whose value addresses an option by index. */
function addressesOptions(type: string): boolean {
  return type === ADDON_TYPE.Checkbox || type === ADDON_TYPE.MultipleChoice;
}

/** Coerce one selection value to a finite, non-negative option index. */
function toIndex(raw: AddonSelectionValue): number | undefined {
  const value = typeof raw === "string" ? Number(raw.trim()) : raw;
  if (typeof value !== "number") return undefined;
  if (!Number.isInteger(value) || value < 0) return undefined;
  return value;
}

/** The option indexes a selection addresses, in the order the shopper's value holds them. */
function selectedIndexes(raw: AddonSelectionValue): number[] {
  const candidates = Array.isArray(raw) ? raw : [raw];
  const indexes: number[] = [];
  for (const candidate of candidates) {
    const index = toIndex(candidate);
    if (index !== undefined) indexes.push(index);
  }
  return indexes;
}

/**
 * The encoder table. One row per shipped type, and the row is chosen by the
 * group's own `type` — never by the shape of the value being held.
 *
 * The asymmetry that catches people is real and measured
 * (`class-wc-product-addons-cart.php:96-114`): `checkbox` requires an **array**
 * even for a single selection, `multiple_choice` requires a **scalar**, and
 * both are 0-based. Getting a row wrong produces a server-side
 * `woocommerce_pao_invalid_addon_value`, not a local failure, which is why each
 * row has its own unit test.
 *
 * `heading` and `file_upload` have **no row**. Their absence is the contract:
 * PAO's validators skip headings entirely (`cart.php:247`), and a file upload
 * blocks add-to-cart rather than travelling.
 *
 * A row returns `undefined` to mean "omit this group". An unselected required
 * group is simply absent and the store rejects it — the client never pre-empts
 * that verdict (D-14.1-02).
 */
const WIRE_ENCODERS: Readonly<
  Record<
    string,
    (raw: AddonSelectionValue) => number | number[] | string | undefined
  >
> = {
  [ADDON_TYPE.Checkbox]: (raw) => {
    const indexes = selectedIndexes(raw);
    return indexes.length > 0 ? indexes : undefined;
  },
  [ADDON_TYPE.MultipleChoice]: (raw) => {
    if (Array.isArray(raw)) {
      const [first] = selectedIndexes(raw);
      return first;
    }
    return toIndex(raw);
  },
  [ADDON_TYPE.CustomText]: encodeText,
  [ADDON_TYPE.CustomTextarea]: encodeText,
  [ADDON_TYPE.Datepicker]: encodeText,
  [ADDON_TYPE.InputMultiplier]: encodeNumber,
  [ADDON_TYPE.CustomPrice]: encodeNumber,
};

function encodeText(raw: AddonSelectionValue): string | undefined {
  if (Array.isArray(raw)) return undefined;
  const text = String(raw).trim();
  return text.length > 0 ? text : undefined;
}

function encodeNumber(raw: AddonSelectionValue): number | undefined {
  if (Array.isArray(raw)) return undefined;
  if (typeof raw === "string" && raw.trim().length === 0) return undefined;
  const value = Number(typeof raw === "string" ? raw.trim() : raw);
  return Number.isFinite(value) ? value : undefined;
}

/** PAO compares `(int) $addon['id'] === $key`, so a key that is not purely numeric never coerces (RESEARCH Pitfall 4). */
const NUMERIC_ID = /^[0-9]+$/;

/**
 * Build `addons_configuration` — the only place the wire shape is derived.
 *
 * Keys are add-on group ids as plain decimal strings; values follow the
 * encoder table above. A group whose id is not a run of digits is dropped
 * rather than put on the wire, so the numeric-key property PAO depends on holds
 * structurally rather than by convention. (It also means the extension's
 * positional `field_name` — "229-0" — cannot leak in as a key; D-14.1-03.)
 *
 * No price travels here. There is no field one could travel in.
 */
export function buildAddonsConfiguration(
  addons: readonly AddonGroupShape[],
  selection: Readonly<AddonSelection>,
): AddonsConfiguration {
  const config: AddonsConfiguration = {};

  for (const group of addons) {
    if (!NUMERIC_ID.test(group.id)) continue;

    const encode = WIRE_ENCODERS[group.type];
    if (!encode) continue;

    const raw = selection[group.id];
    if (raw === undefined || raw === null) continue;

    const value = encode(raw);
    if (value === undefined) continue;

    config[group.id] = value;
  }

  return config;
}

/**
 * Build `headkit_addons_verify` — the R1 drift guard's payload.
 *
 * For each group the shopper actually chose an option from, the chosen index
 * mapped to the label this client rendered for it. The theme's priority-9
 * filter re-checks each index against the label it is about to price and
 * rejects the whole add-item with `headkit_addon_option_drift` when they
 * disagree (14.1-02, D-P2). Omitting the map is safe — the guard is inert.
 *
 * Labels are echoed **byte-for-byte as received**, not entity-decoded: the
 * theme compares `sanitize_title()` of this string against `sanitize_title()`
 * of the stored definition, and the stored form is the encoded one. Decoding
 * here would make an honest selection look like drift.
 *
 * It carries labels only — no prices, and no ids beyond the group key.
 */
export function buildAddonsVerify(
  addons: readonly AddonGroupShape[],
  selection: Readonly<AddonSelection>,
): AddonsVerify {
  const verify: AddonsVerify = {};

  for (const group of addons) {
    if (!NUMERIC_ID.test(group.id)) continue;
    if (!addressesOptions(group.type)) continue;

    const raw = selection[group.id];
    if (raw === undefined || raw === null) continue;

    const labels: Record<string, string> = {};
    for (const index of selectedIndexes(raw)) {
      const option = group.options[index];
      if (!option) continue;
      labels[String(index)] = option.label;
    }

    if (Object.keys(labels).length > 0) {
      verify[group.id] = labels;
    }
  }

  return verify;
}

/**
 * One priced contribution to the line, by price type.
 *
 * Measured, not intuited (RESEARCH §Price Semantics, base $100 / AUD / minor
 * units, 2026-08-12):
 *
 *  - `flat_fee` is charged **once per line**. The Store API reports it divided
 *    by line quantity ($50 on qty 2 → +$25/unit) but that division is a
 *    reporting artifact of the response, not of the charge.
 *  - `quantity_based` adds the price to the **unit** price, so the line
 *    multiplies it.
 *  - `percentage_based` adds `base x pct/100` to the unit price — also per unit.
 */
function priceContribution(
  price: number,
  priceType: string,
  basePrice: number,
  quantity: number,
): number {
  if (price === 0) return 0;
  switch (priceType) {
    case ADDON_PRICE_TYPE.QuantityBased:
      return price * quantity;
    case ADDON_PRICE_TYPE.PercentageBased:
      return ((basePrice * price) / 100) * quantity;
    case ADDON_PRICE_TYPE.FlatFee:
    default:
      return price;
  }
}

/**
 * The estimated line total: base x quantity, plus every priced selection.
 *
 * **This figure is a preview and is never transmitted.** It exists to satisfy
 * UI-SPEC's summary panel, is always labelled "Estimated" and always carries
 * its disclaimer, and the authoritative number is whatever the cart returns
 * after the store has priced the line itself.
 *
 * Six of the eight shipped types price at **group** level rather than per
 * option (14.1-03): `input_multiplier` multiplies its group price by the typed
 * number, `custom_price` contributes the typed amount itself, and
 * `custom_text` / `custom_textarea` / `datepicker` may carry an optional flat
 * fee that applies once the shopper fills the field in. Option-bearing types
 * leave the group price empty and price per option.
 */
export function estimateAddonsTotal(
  addons: readonly AddonGroupShape[],
  selection: Readonly<AddonSelection>,
  basePrice: number,
  quantity: number,
): number {
  let total = basePrice * quantity;

  for (const group of addons) {
    const raw = selection[group.id];
    if (raw === undefined || raw === null) continue;

    if (addressesOptions(group.type)) {
      for (const index of selectedIndexes(raw)) {
        const option = group.options[index];
        if (!option || option.visibility === 0) continue;
        total += priceContribution(
          getFloatVal(option.price),
          option.priceType,
          basePrice,
          quantity,
        );
      }
      continue;
    }

    if (group.type === ADDON_TYPE.InputMultiplier) {
      const multiplier = encodeNumber(raw);
      if (multiplier === undefined) continue;
      total += priceContribution(
        getFloatVal(group.price) * multiplier,
        group.priceType,
        basePrice,
        quantity,
      );
      continue;
    }

    if (group.type === ADDON_TYPE.CustomPrice) {
      const typed = encodeNumber(raw);
      if (typed === undefined) continue;
      total += priceContribution(typed, group.priceType, basePrice, quantity);
      continue;
    }

    // custom_text / custom_textarea / datepicker: an optional group-level fee
    // that applies once the shopper has actually filled the field in.
    if (WIRE_ENCODERS[group.type] && encodeText(raw) !== undefined) {
      total += priceContribution(
        getFloatVal(group.price),
        group.priceType,
        basePrice,
        quantity,
      );
    }
  }

  return total;
}

/**
 * The price suffix for one option (or one group-level price), in the format its
 * own price type means. No arithmetic happens here — the figure is the
 * definition's, formatted.
 *
 * Rendering all three as `+$X` would misquote two of them, so this is the only
 * place the three formats are expressed.
 *
 * Returns `null` when the price is empty, zero or absent: a free option shows
 * no suffix at all.
 */
export function formatAddonPriceSuffix(
  price: string | null | undefined,
  priceType: string,
  currency?: string,
): string | null {
  if (!price) return null;
  const value = getFloatVal(price);
  if (value === 0) return null;

  switch (priceType) {
    case ADDON_PRICE_TYPE.PercentageBased:
      return `+${value}%`;
    case ADDON_PRICE_TYPE.QuantityBased:
      return `+${formatPrice(value, currency)} each`;
    case ADDON_PRICE_TYPE.FlatFee:
    default:
      return `+${formatPrice(value, currency)}`;
  }
}

/**
 * The currency adornment a `custom_price` input carries, and the room the input
 * must reserve for it.
 */
export type AddonPricePrefix = {
  /** The store currency's symbol as `Intl` renders it — `$`, `A$`, `CHF`, … */
  readonly symbol: string;
  /**
   * A `padding-left` for the input, or `undefined` to leave the primitive's own
   * padding standing.
   */
  readonly paddingLeft: string | undefined;
};

/**
 * The currency symbol for a `custom_price` input, and the left padding that
 * keeps the typed value clear of it.
 *
 * **Why this is derived and not a constant (UAT gap 2).** The symbol's width is
 * variable — one character for `$`, `€`, `£`; two for `A$`; three for `NZ$`,
 * `CA$` and `CHF` — while the reservation used to be a fixed `pl-7` (28px). On
 * an AUD store the `A$` therefore rendered on top of the shopper's value, and
 * because USD/EUR/GBP never show it, the defect selects precisely for the
 * Australian customer this phase exists to serve.
 *
 * The reservation is an approximation by construction: `ch` is the advance of
 * the `0` glyph, and `A$` is not exactly two zeroes wide in a proportional
 * face. That is why it is gated by a geometric browser assertion
 * (`e2e/product-addons.spec.ts`, "the currency prefix … never occupy the same
 * space") rather than by the arithmetic looking right.
 *
 * **Only `symbol.length` — a number — reaches the CSS expression.** The symbol
 * string never does. The store's currency code is configuration arriving from
 * commerce, and a length is not a value anything can be smuggled through
 * (T-14.1-10-01).
 *
 * Known limitation, out of scope: {@link formatPrice} hard-codes `en-US`, so
 * every currency renders symbol-FIRST and a prefix adornment is always the
 * correct side. A suffix-positioning locale would need a different adornment
 * entirely — a different defect, pre-existing, unreachable today.
 */
export function addonPricePrefix(currency?: string): AddonPricePrefix {
  // Unchanged in behaviour from what the component did inline: format zero and
  // strip the digits, separators and whitespace, leaving the symbol. `\s`
  // matches the U+00A0 that `Intl` puts in `CHF 0.00`.
  const symbol = formatPrice(0, currency).replace(/[\d.,\s]/g, "");

  // An empty symbol with a computed override would reserve the gap and nothing
  // else — LESS room than the primitive already has, which is the one way this
  // change could make something worse. Leave the primitive's padding alone.
  if (!symbol) return { symbol, paddingLeft: undefined };

  const terms = [
    // 0.75rem MIRRORS THE SPAN'S OWN `left-3` OFFSET in
    // `components/headkit-ui/product-addons.tsx`. These two numbers must move
    // together and they live in different files — change one without the
    // other and this defect comes straight back.
    "0.75rem",
    // One zero-glyph advance per prefix character. `ch` resolves against the
    // element's OWN computed font-size, so it tracks the `Input` primitive's
    // `text-base` → `md:text-sm` change with no breakpoint logic and no
    // second constant.
    `${symbol.length}ch`,
    // The visual gap between the prefix and the first digit of the value.
    "0.5rem",
  ];

  return { symbol, paddingLeft: `calc(${terms.join(" + ")})` };
}

/**
 * The structured rejection commerce emits for an add-to-cart it could not
 * complete. `field` and `addonId` are **absent keys** when there is nothing to
 * put in them, so presence is what matters (14.1-04's contract table).
 */
export type AddonServerError = {
  readonly code: string;
  readonly message: string;
  /** The add-on group's NAME, when the message named one. */
  readonly field?: string;
  /** The add-on group's id, when the message carried one. */
  readonly addonId?: string;
};

/** Where a rejection belongs, and the text to render for it. */
export type AddonErrorAttribution = {
  /** The group the rejection belongs to, or `null` for a form-level banner. */
  readonly addonId: string | null;
  /** The store's own message, entity-decoded. Never rewritten. */
  readonly message: string;
};

/** The group name PAO's `sprintf` put in double quotes, if there is one. */
function quotedGroupName(message: string): string | null {
  const match = /"([^"]+)"/.exec(message);
  return match?.[1] ?? null;
}

/**
 * Attribute a rejection to the group it belongs to, in three steps:
 *
 *  1. `addonId` — the primary path. Only the two `woocommerce_pao_invalid_*`
 *     codes carry one.
 *  2. `field`, matched case-insensitively against the group **name** after
 *     decoding entities on both sides.
 *  3. The name PAO quoted in the message itself, matched the same way.
 *
 * Otherwise `addonId` is `null` and the caller renders a form-level banner —
 * which is where the drift 409 correctly lands, since it names no group by
 * design (T-14.1-02-05).
 *
 * **Never mine an id out of the required-field message.** It is not in there:
 * that message carries the group name and nothing else, so a pattern hunting
 * for an id matches something else in a translated string.
 *
 * Entities are decoded before matching as well as before rendering, because the
 * same rejection reaches us encoded on one transport and plain on the other —
 * measured three separate times in this phase.
 */
export function attributeAddonError(
  addons: readonly AddonGroupShape[] | null | undefined,
  error: AddonServerError,
): AddonErrorAttribution {
  const message = decodeHtmlEntities(error.message);
  // Same absent-key tolerance as hasBlockingAddon — see its comment. A store on an
  // older theme sends no `addons`, and an unattributed error must still surface.
  const groups = addons ?? [];

  if (error.addonId) {
    const byId = groups.find((group) => group.id === error.addonId);
    if (byId) return { addonId: byId.id, message };
    return { addonId: null, message };
  }

  const candidate = error.field ?? quotedGroupName(message);
  if (candidate) {
    const wanted = decodeHtmlEntities(candidate).trim().toLowerCase();
    const byName = groups.find(
      (group) => decodeHtmlEntities(group.name).trim().toLowerCase() === wanted,
    );
    if (byName) return { addonId: byName.id, message };
  }

  return { addonId: null, message };
}
