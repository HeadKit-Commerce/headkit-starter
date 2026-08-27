# Figma token alignment — Velvet starter

This guide maps the **Velvet** Figma file to HeadKit’s customer-owned override artifacts so agents (and humans) can keep design and code in sync.

## File

| Field                   | Value                                                                |
| ----------------------- | -------------------------------------------------------------------- |
| File                    | [Velvet](https://www.figma.com/design/X5OSLihKQQWAoKz1sk0M3D/Velvet) |
| File key                | `X5OSLihKQQWAoKz1sk0M3D`                                             |
| Primary reference frame | **Home NEW - Desktop** (`237:3465`)                                  |
| UI canvas (components)  | `237:2928`                                                           |

Use frame `237:3465` for layout and typography extraction. The top-level canvas node may fail MCP design-context calls — always prefer the named frame.

## Create Figma variables (recommended collection)

Figma currently has **no variables** on this file. Create a collection named `HeadKit / Velvet` with these modes:

### Color

| Variable             | Hex       | Maps to                                                                     |
| -------------------- | --------- | --------------------------------------------------------------------------- |
| `color/page`         | `#FFFDF3` | Page background → `design-tokens.json` → `color.page` → CSS `--velvet-page` |
| `color/surface-sand` | `#F3EBE0` | Pre-header, footer → `color.surfaceSand`                                    |
| `color/accent`       | `#9C8867` | Pre-header text, column labels → `color.accent`                             |
| `color/ink`          | `#524A41` | Body, nav links → `color.ink`                                               |
| `color/ink-strong`   | `#3F2A24` | Section titles → `color.inkStrong`                                          |
| `color/muted`        | `#9C9791` | Secondary copy                                                              |
| `color/muted-legal`  | `#6D6D6D` | Footer legal                                                                |
| `color/hero-ink`     | `#FFFDF3` | Hero headline on photography                                                |
| `color/badge-new`    | `#09500F` | “New” product badge                                                         |

### Space

| Variable                    | Value | Maps to               |
| --------------------------- | ----- | --------------------- |
| `space/page-gutter`         | `40`  | Horizontal page inset |
| `space/preheader-height`    | `36`  | Pre-header bar        |
| `space/nav-height`          | `80`  | Main nav              |
| `space/hero-height-desktop` | `850` | Hero media (desktop)  |

### Typography (semantic — fonts come from dashboard)

Fonts **Romie** (display) and **FFF Acid Grotesk** (UI) are configured in the HeadKit dashboard, not in Figma export. In Figma, still name text styles for handoff:

| Style                | Size | Case      | Notes                    |
| -------------------- | ---- | --------- | ------------------------ |
| `type/nav-label`     | 15   | uppercase | Primary + secondary nav  |
| `type/preheader`     | 13   | uppercase | Centred promo bar        |
| `type/hero-title`    | 36   | —         | Hero H1                  |
| `type/section-title` | 32   | —         | Carousel section headers |
| `type/legal`         | 13   | —         | Footer fine print        |

## Repo artifacts (import ladder)

```
Figma variables/styles
    ↓ manual or future MCP/plugin
overrides/design-tokens.json   ← colours, space, type metadata
overrides/theme.json          ← layout modes (nav, hero shell)
overrides/styles.css          ← Pass 1 CSS using tokens + hooks
Dashboard branding            ← fonts, primary palette, logo
```

### `theme.json` layout modes

| Key           | Velvet value    | Platform effect                    |
| ------------- | --------------- | ---------------------------------- |
| `navLayout`   | `centered-logo` | Logo centred; menus left/right     |
| `navStyle`    | `text-labels`   | “Search”, “my account”, “cart [n]” |
| `heroLayout`  | `fixed-height`  | Full-bleed, 850px desktop hero     |
| `homepageNav` | `overlay-hero`  | Transparent nav over homepage hero |

These emit SSR-safe `data-*` attributes on `<html>` (see `lib/store-theme.ts`).

## Starter template as editable Figma

Goal: maintain a **HeadKit Starter** Figma library mirroring hook classes (`headkit-nav`, `headkit-hero-carousel`, etc.) so merchants can fork Velvet → their brand without re-learning component names.

Suggested pages in Figma:

1. **Tokens** — variables above
2. **Chrome** — pre-header, nav (left + centred variants), footer
3. **Home modules** — hero, product/category/brand carousels, callout
4. **Commerce** — PLP grid, PDP buy box (reference only for Shopify)

Name layers with the same `headkit-*` prefix used in code.

## Future automation

Pass 1 is manual JSON + CSS. Later: Figma plugin or HeadKit MCP step to read variables + frame layout and write `design-tokens.json` / `theme.json` / a CSS diff. Until then, update the three override files together when Figma changes.
