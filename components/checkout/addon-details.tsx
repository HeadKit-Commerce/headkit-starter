import { decodeHtmlEntities } from "@/lib/utils";

/**
 * One add-on selection, as this panel needs it.
 *
 * Deliberately narrower than the SDK's `CartItemAddonSelection`, which also
 * carries `price`, `priceType` and `fieldType`. None of those three is
 * displayable here:
 *
 *   - `price` / `priceType` — the cart, checkout and confirmation lines are
 *     price-free (see the component doc below);
 *   - `fieldType` — populated for a live cart but always empty for a placed
 *     order, because the provider's order meta records none (14.1-03). No
 *     display may branch on it, so the panel cannot see it.
 *
 * A wider object still satisfies this shape, so every call site passes its
 * line's `addons` array straight through.
 */
export interface AddonDisplay {
  addonId: string;
  name: string;
  value: string;
}

interface AddonDetailsProps {
  addons: readonly AddonDisplay[];
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
 * **No money appears on the row.** This is measurement-driven, not taste. The
 * Store API reports a flat fee *divided by line quantity*, so a $50 option on a
 * quantity of two comes back as `25`, and printing that beside an option the
 * shopper chose at $50 is worse than printing nothing. Quantity-based and
 * percentage-based add-ons fold into the unit price and report no per-add-on
 * figure at all. The line total already on the row is the authoritative combined
 * number, and the gift-card panel this mirrors is likewise price-free.
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
export function AddonDetails({ addons }: AddonDetailsProps) {
  if (addons.length === 0) return null;

  return (
    <div className="rounded-[3px] bg-primary/5 px-3 py-2 text-xs text-gray-600 space-y-0.5">
      <p className="font-semibold text-primary">Options</p>
      {addons.map((addon, i) => (
        // A checkbox group contributes one selection per checked option, all
        // sharing an addonId, so the id alone is not a key.
        <p key={`${addon.addonId}-${i}`}>
          <span className="text-gray-400">
            {decodeHtmlEntities(addon.name)}:
          </span>{" "}
          {decodeHtmlEntities(addon.value)}
        </p>
      ))}
    </div>
  );
}
