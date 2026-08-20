import { formatAddonPriceSuffix } from "@/lib/addons";
import { decodeHtmlEntities } from "@/lib/utils";

/**
 * One add-on selection, as this panel needs it.
 *
 * Narrower than the SDK's `CartItemAddonSelection`, which also carries
 * `fieldType`. That one field is not displayable here: it is populated for a
 * live cart but always empty for a placed order, because the provider's order
 * meta records none (14.1-03). No display may branch on it, so the panel cannot
 * see it.
 *
 * `price` and `priceType` are REQUIRED, not optional. Both producers fill them
 * — the cart from `extensions.headkit.addons_selection[]` and the order from
 * `_pao_ids[].raw_price` / `.price_type` — and a caller that could omit them
 * would silently drop the money from the row, which is the defect this shape
 * exists to make impossible. A wider object still satisfies it, so every call
 * site passes its line's `addons` array straight through.
 */
export interface AddonDisplay {
  addonId: string;
  name: string;
  value: string;
  /** The merchant-configured price, as a decimal string. `""` or `"0"` when free. */
  price: string;
  /** `flat_fee`, `quantity_based` or `percentage_based`. */
  priceType: string;
}

interface AddonDetailsProps {
  addons: readonly AddonDisplay[];
  /**
   * Store currency for the price suffixes. REQUIRED for the same reason
   * `price` and `priceType` are: omitting it does not fail, it falls through to
   * the `NEXT_PUBLIC_STORE_CURRENCY` deploy constant, so a call site on a
   * non-AUD store would silently render `+A$50.00` beside a line priced in
   * another currency.
   */
  currency: string;
  /**
   * HeadKit Quote mode: render every selection's name and value exactly as
   * normal, but no price suffix. A quote must still echo what the shopper
   * configured (PAO-03) — it just carries no money anywhere on the page.
   *
   * REQUIRED, like `price` / `priceType` / `currency`, and for a stronger
   * reason: an optional flag defaulting to `false` would let a future call site
   * silently reintroduce the leak this closes, and the surrounding gates
   * (`hidePrice` on the line total, `isQuoteMode` on the drawer price block)
   * would not catch it because the panel mounts outside them.
   */
  hidePrice: boolean;
}

/**
 * AddonDetails echoes the shopper's Product Add-Ons selections back to them on
 * the cart drawer line, the checkout summary, the order confirmation and the
 * account order detail (PAO-03). One component, four surfaces, reading the one
 * field both producers fill: `CartItem.addons`.
 *
 * **The visual treatment is copied from `gift-card-details.tsx`, not
 * re-derived.** The panel class string is byte-identical to that file's, which
 * puts three values outside the project's 4px spacing scale — the `rounded-[3px]`
 * corner, the `px-3` horizontal padding and the `space-y-0.5` row gap. That is
 * deliberate and it is the whole point: a cart line can carry a gift-card panel
 * and an add-ons panel at once, and they must read as one system rather than as
 * two features. Do not normalise them to the scale — UI-SPEC's checker raised
 * exactly this as a non-blocking flag and asked that the justification travel
 * with the code. `addon-details.test.tsx` asserts the identity class by class.
 *
 * **Each priced option shows its own price, in the format its price type
 * means** — the same `formatAddonPriceSuffix` and the same right-aligned row the
 * PDP's "Your selection" panel uses, so the figure a shopper approved on the
 * product page is the figure they see again in the cart. A free option shows no
 * suffix at all.
 *
 * **This reverses UI-SPEC U-03, which suppressed the money on a measurement
 * that was attributed to the wrong field.** U-03 held that "the Store API
 * reports a flat fee divided by line quantity, so a $50 option on a quantity of
 * two comes back as 25", and that quantity-based and percentage-based add-ons
 * "report no per-add-on figure at all". Both statements are true of
 * `prices.price` — the line's UNIT price, which PAO does divide a flat fee into
 * (`class-wc-product-addons-cart.php:907`, `$addon_price / $quantity`) and does
 * fold the other two types into. Neither is true of
 * `extensions.headkit.addons_selection[].price`, which is what this component
 * actually receives: that loop reads `$addon['price']` and writes only into the
 * product price, never back into the selection entry.
 *
 * Re-measured against the local e2e stack (WooCommerce 10.9.4, Product Add-Ons
 * 8.4.0, `glam-booth-all-types`, group 1900000103):
 *
 * ```
 * qty 1  prices.price = 61890   selection prices = 20 / 10 / 50
 * qty 3  prices.price = 58557   selection prices = 20 / 10 / 50
 * ```
 *
 * `prices.price` moves with quantity; the selection prices do not. They are the
 * merchant's configured figures for all three price types, which is exactly
 * what {@link formatAddonPriceSuffix} is built to render and why no arithmetic
 * happens here.
 *
 * **Values are shopper-supplied.** `custom_text` and `custom_textarea` values
 * round-trip through the cart into the order meta and back out entity-encoded
 * (measured: order 230 returns `Sam &amp; Alex, 12 Dec`). They are decoded once
 * and then rendered as React children, so they come back escaped. Never a raw
 * HTML render — including as a way to strip the plugin's own flat-fee price
 * markup, which this component never reads: it reads the structured selection
 * the theme echoes and the order meta commerce extracts, and neither carries
 * markup.
 *
 * An empty selection list renders nothing at all — no wrapper, no heading, no
 * spacing — so a line without add-ons is unchanged from what shipped before
 * this phase (PAO-04).
 */
export function AddonDetails({
  addons,
  currency,
  hidePrice,
}: AddonDetailsProps) {
  if (addons.length === 0) return null;

  return (
    <div className="rounded-[3px] bg-primary/5 px-3 py-2 text-xs text-gray-600 space-y-0.5">
      <p className="font-semibold text-primary">Options</p>
      {addons.map((addon, i) => {
        const suffix = hidePrice
          ? ""
          : formatAddonPriceSuffix(addon.price, addon.priceType, currency);
        return (
          // A checkbox group contributes one selection per checked option, all
          // sharing an addonId, so the id alone is not a key.
          <p
            key={`${addon.addonId}-${i}`}
            className="flex items-start justify-between gap-3"
          >
            <span>
              <span className="text-gray-400">
                {decodeHtmlEntities(addon.name)}:
              </span>{" "}
              {decodeHtmlEntities(addon.value)}
            </span>
            {suffix && <span className="shrink-0">{suffix}</span>}
          </p>
        );
      })}
    </div>
  );
}
