# Velvet Pass 1 — gaps and follow-ups

Tracked items that are **not** solved in Pass 1 (`overrides/styles.css` + layout modes). Hard-coded or partial implementations are called out here for the next pass or CMS work.

## Closed in Pass 1 (platform + overrides)

| Item                       | Approach                                                    |
| -------------------------- | ----------------------------------------------------------- |
| Centred logo               | `theme.json` → `navLayout: centered-logo` + `NavigationBar` |
| Text nav actions           | `navStyle: text-labels` → `HeaderActions`                   |
| Full-bleed 850px hero      | `heroLayout: fixed-height` → `MainCarousel` + CSS           |
| Homepage nav overlay       | `homepageNav: overlay-hero` + `:has(.headkit-home)` CSS     |
| Page / footer sand palette | `styles.css` + `design-tokens.json`                         |
| Figma variable guide       | `FIGMA.md`                                                  |

## Open — homepage sections (Shopify / CMS)

| Section (Figma)                       | Status    | Recommendation                         |
| ------------------------------------- | --------- | -------------------------------------- |
| Insignia / editorial band             | Not built | CMS HTML block or future Sanity module |
| Bundle editorial (split image + copy) | Not built | CMS / Sanity — complex layout          |
| Footer “VELVET” wordmark              | Not built | Custom footer slot or WP footer HTML   |
| Column header accent bars             | Partial   | CSS on `.headkit-section-header` only  |

**Practical call:** ship Pass 1 chrome + hero + tokenized carousels; add editorial sections when Velvet content exists in Shopify/WP or via Sanity integration.

## Open — Shopify-specific blocks

HeadKit Shopify path does not yet expose all WP HeadKit blocks (`headkit-brand-carousel`, etc.). For Velvet:

- Use **hardcoded starter fallbacks** on homepage where WP patterns are absent
- Do **not** block Pass 1 on parity with WooCommerce block library
- Document each hardcoded section in PR / customer sync notes

## Open — styling limits

| Limit                                         | Notes                                                                |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Dashboard `--color-*` may override some hooks | Pass 1 uses `--velvet-*` and high-specificity selectors where needed |
| Nav overlay when mega-menu open               | JS sets solid `bg-brand-bg` on open — intentional                    |
| Wishlist hidden in text-label mode            | Matches Figma desktop chrome (Search / account / cart only)          |
| Sale highlight colour still starter pink      | Override in `styles.css` if Velvet needs accent-only highlights      |

## Open — fonts

Romie + FFF Acid Grotesk are **dashboard-managed** (Velvet already configured). No override work required.

## Future platform work

1. **Figma → repo import** (plugin / MCP): variables → `design-tokens.json`, frame metrics → `theme.json`
2. **Footer / editorial slots** in `overrides/` without forking `Footer.tsx`
3. **Sanity** (or similar) for PDP/marketing modules with nicer authoring than raw HTML
4. **Starter default `theme.json`** in template vs per-customer fork (platform main should default to `left-logo` + `icons` + `inset`)

## Upgrade / IP guardrails

See `docs/customization-playbook.md` — customer changes stay in `overrides/`; core `components/headkit-ui/` receives hook additions only upstream.
