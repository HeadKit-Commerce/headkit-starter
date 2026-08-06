# Storefront overrides

Customer-owned customisation layer. **Prefer this directory for UI and styling edits.**

Platform template upgrades should leave `overrides/` alone. You still have the full storefront repo if you need deeper changes — use that as an escape hatch, not the default.

## What goes here

| Path | Purpose |
|------|---------|
| `styles.css` | CSS beyond dashboard branding (layout, spacing, hide elements, tweaks) |
| `header-actions.tsx` | Extra header icons (e.g. phone) between Account and Cart |

## What stays elsewhere

| Concern | Prefer |
|---------|--------|
| Brand colours, fonts, corner style, icons | Dashboard → Branding (runtime CSS vars) |
| Copy / product data / checkout fields | Store config & commerce APIs (coming later) |
| One-off pages or unique React behaviour | New routes under `app/` or local components — avoid editing `components/headkit-ui/` when a hook + CSS will do |

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

## Header action extras

`header-actions.tsx` is mounted by the core header between Account and Cart (desktop) and after Account (mobile sheet). Put store-specific actions here (phone, etc.) so template upgrades do not overwrite them.

Return `null` from `HeaderActionExtras` / `MobileHeaderActionExtras` to hide them (default in the starter template).

## CSS hook classes (stable selectors)

The starter ships **hook classes** on key layout regions so you can target them from `overrides/styles.css` without editing React components. All hooks use the `headkit-*` prefix and match WordPress block pattern names where applicable.

| Hook class | Where | Use for |
|------------|-------|---------|
| `headkit-home` | Homepage root wrapper | Homepage-only rules (section backgrounds, spacing) |
| `headkit-nav` | Main navigation bar | Nav link typography, uppercase, hover states |
| `headkit-footer` | Site footer | Footer background, borders, typography |
| `headkit-callout` | Callout / promo blocks | Background, text colour, button row |
| `headkit-brand-carousel` | Brand carousel sections | Carousel dots, logo sizing, section padding |
| `headkit-category-carousel` | Category carousel sections | Same as above for category rails |
| `headkit-product-carousel` | Product carousel sections | Product rail styling |
| `headkit-post-carousel` | News / blog carousel sections | Post card styling |
| `headkit-project-carousel` | Projects carousel sections | Project card styling |
| `headkit-footer-payment-methods` | Footer payment icon row | Hide or resize payment badges |

### Examples

```css
/* Nav: uppercase top-level links (desktop mega-menu) */
.headkit-nav > ul > li > a,
.headkit-nav > ul > li > button {
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

/* Homepage: alternate section backgrounds */
.headkit-home .headkit-brand-carousel {
  background-color: var(--brand-bg, #fff);
}

/* Callout: brand-coloured promo band */
.headkit-callout {
  background-color: hsl(var(--primary));
  color: hsl(var(--primary-foreground));
}

/* Footer: background tint */
.headkit-footer {
  background-color: var(--brand-bg, #fff);
}

/* Footer: hide payment icons */
.headkit-footer-payment-methods {
  display: none;
}
```

### CMS blocks vs hardcoded sections

WordPress editor blocks and hardcoded starter fallbacks (when WP does not provide a pattern) both expose the same hook classes — e.g. `headkit-brand-carousel` works whether the brands section comes from a WP pattern or the starter fallback on `app/page.tsx`.

## Full-repo escape hatch

Store owners and agents can still change any file in this repo. That works, but merges against future HeadKit starter updates become manual. Prefer `overrides/` (and dashboard branding) so core storefront code stays upgradeable.

**Do not edit `components/headkit-ui/` for cosmetic CSS** when a hook class above covers the target. If a region lacks a hook, open a platform PR to add one rather than patching the component in a customer repo.

## Future

Named React slots, copy overrides, and feature flags may land here later.
