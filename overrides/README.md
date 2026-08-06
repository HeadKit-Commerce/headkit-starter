# Storefront overrides

Customer-owned customisation layer. **Prefer this directory for UI and styling edits.**

Platform template upgrades should leave `overrides/` alone. You still have the full storefront repo if you need deeper changes — use that as an escape hatch, not the default.

## What goes here

| Path | Purpose |
|------|---------|
| `styles.css` | CSS beyond dashboard branding (layout, spacing, hide elements, tweaks) |

## What stays elsewhere

| Concern | Prefer |
|---------|--------|
| Brand colours, fonts, corner style, icons | Dashboard → Branding (runtime CSS vars) |
| Copy / product data / checkout fields | Store config & commerce APIs (coming later) |
| One-off pages or unique React behaviour | New routes under `app/` or local components — avoid editing `components/headkit-ui/` when a slot/override will do |

## Styling

Edit `styles.css`. It is imported from the root layout after `app/globals.css`.

Dashboard branding still sets primary colour, fonts, and radii at runtime. Use overrides for everything those tokens do not cover (and for intentional CSS visibility rules such as hiding prices).

```css
/* Example: hide prices site-wide */
.price,
[data-price] {
  display: none;
}
```

## Full-repo escape hatch

Store owners and agents can still change any file in this repo. That works, but merges against future HeadKit starter updates become manual. Prefer `overrides/` (and dashboard branding) so core storefront code stays upgradeable.

## Future

Named React slots, copy overrides, and feature flags may land here later. Start with CSS only.
