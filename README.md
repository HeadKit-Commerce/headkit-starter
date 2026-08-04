<p align="center">
  <a href="https://headkit.io">
    <img src="https://storage.googleapis.com/headkit-storage/HeadKit.png" height="96">
  </a>
</p>

<p align="center">
  Build complex headless commerce stores...fast
</p>

# HeadKit Starter

**Reference storefront template** for the HeadKit commerce platform — a production-ready Next.js 16 storefront powered by WooCommerce.

## Prerequisites

- Node.js >= 24
- Bun >= 1.3
- A WooCommerce site with the HeadKit theme installed

The starter runs within the monorepo and requires the GraphQL gateway and commerce services for full functionality. Use `bun run dev` from the monorepo root to start all services together.

## Features

- **Home Page** — Hero carousel, featured products, new arrivals, categories, brands, blog, newsletter
- **Collections** — Infinite scroll, filters (category, brand, attributes, price, stock), sort, breadcrumbs
- **Product Detail** — Variable products with swatch selectors, URL-synced variant params, quantity selector, image gallery with lightbox, tabs (description, additional info, reviews)
- **Cart** — Slide-out drawer, optimistic updates, stock validation, coupon support
- **Checkout** — Multi-step flow (contact, delivery, shipping, payment) with Stripe Checkout Session + Stripe Elements
- **Account** — Login, register, password reset, profile, order history, wishlist
- **Search** — Full-text product search with debounced input
- **Blog / News** — Posts with categories, featured images, block editor content
- **Brands** — Brand listing and detail pages
- **SEO** — JSON-LD (product, breadcrumb, article, FAQ, website, searchbox), sitemap, robots.txt, OpenGraph, Twitter cards
- **CMS** — WordPress block editor integration for custom page content
- **Performance** — Next.js 16.3 Instant Navigations (`cacheComponents` + `partialPrefetching`), `"use cache"` directives, route-level Suspense boundaries, loading skeletons, error boundaries

```shellscript
HEADKIT_PRIVATE_KEY
```

## Quick Start

```bash
# From the monorepo root
bun install
cp apps/starter/.env.example apps/starter/.env.local

# Edit .env.local with your HeadKit API keys
bun run dev --filter=starter
```

Open [http://localhost:3000](http://localhost:3000).

## Project Structure

| Directory                | Description                          |
| ------------------------ | ------------------------------------ |
| `app/`                   | Next.js App Router pages and layouts |
| `components/ui/`         | Low-level primitives (shadcn-like)   |
| `components/headkit-ui/` | Commerce-specific components         |
| `components/seo/`        | JSON-LD, sitemap utilities           |
| `lib/`                   | SDK, env, cart, checkout helpers     |

## SEO Features

- **Dynamic sitemap** — Products, collections, brands, and posts in `app/sitemap.ts`
- **robots.txt** — `app/robots.ts` with allow/disallow rules for account, checkout, API, search
- **JSON-LD** — Product, breadcrumb, article, FAQ, website, searchbox (see `components/seo/`)
- **Metadata** — OpenGraph, Twitter cards, canonical URLs

## Standalone vs Monorepo

The starter depends on `@headkit/sdk` (workspace) and backend services (gateway, commerce). For local development, run from the monorepo root:

```bash
# From headkit-platform root — starts gateway, commerce, and starter
bun run dev
```

To run only the starter (requires gateway/commerce already running):

```bash
bun run dev --filter=starter
```

## Environment Variables

| Variable                         | Required | Description                                                   |
| -------------------------------- | -------- | ------------------------------------------------------------- |
| `NEXT_PUBLIC_HEADKIT_PUBLIC_KEY` | Yes      | Public API key (safe for browser)                             |
| `HEADKIT_PRIVATE_KEY`            | Yes      | Secret key (server-side only)                                 |
| `NEXT_PUBLIC_GRAPHQL_URL`        | No       | Gateway URL (default: `http://localhost:4000/graphql`)        |
| `NEXT_PUBLIC_FRONTEND_URL`       | No       | Public frontend URL for SEO                                   |
| `NEXT_PUBLIC_GTM_ID`             | No       | Google Tag Manager container ID                               |
| `IMAGE_DOMAIN`                   | No       | Domain for Next.js remote images (e.g. WooCommerce media URL) |

## Routes

| Route                        | Description                                           |
| ---------------------------- | ----------------------------------------------------- |
| `/`                          | Home page                                             |
| `/shop`                      | All products                                          |
| `/shop/[...slug]`            | Product detail (supports subcategory paths)           |
| `/collections/[...slug]`     | Collection / category (supports nested subcategories) |
| `/brand`, `/brand/[...slug]` | Brand listing and detail                              |
| `/news`, `/news/[...slug]`   | Blog listing and post detail                          |
| `/search`                    | Search results                                        |
| `/sale`, `/new`, `/featured` | Filtered product listings                             |
| `/checkout`                  | Multi-step checkout                                   |
| `/checkout/success`          | Order confirmation                                    |
| `/account`                   | Login / Register                                      |
| `/account/profile`           | Profile management                                    |
| `/account/orders`            | Order history                                         |
| `/account/wishlist`          | Saved products                                        |
| `/contact`, `/faq`           | Static pages                                          |

## Customization

### Theme

Edit `app/globals.css` to change the color palette. Brand tokens live in
plain `@theme` (so runtime branding can override them); `purple-500` tracks
`--color-primary` for hovers and accents:

```css
@theme {
  --color-primary: #7f54b3;
  --color-secondary: #000000;
  --color-primary-text: #ffffff;
  --color-purple-500: var(--color-primary);
}
```

### Components

This starter uses the `@headkit/ui` component system. Components live in two layers:

- `components/ui/` — Low-level primitives (button, input, dialog, etc.)
- `components/headkit-ui/` — Commerce components (product-card, cart-drawer, etc.)

Add or update components:

```bash
npx @headkit/ui add product-card cart-drawer
npx @headkit/ui list --installed
```

Component config lives in `headkit-ui.config.json`. The CSS path is `app/globals.css` (no `src/` prefix).

### SDK

The SDK is available as a singleton in `lib/sdk.ts` (public) and `lib/sdk.server.ts` (server-side). All environment variables are validated via Zod in `lib/env.ts`.

```typescript
import { headkit } from "@/lib/sdk";
const product = await headkit.products.get("product-slug");
```

## Testing

```bash
bun run test         # Run Vitest once
bun run test:watch   # Watch mode for development
```

See `lib/checkout-success-utils.test.ts` for an example of unit tests.

## Deployment

Deploy to Vercel (HeadKit-controlled). Set all required environment variables in production. See the [root README](../../README.md) for full platform deployment.

## Tech Stack

- Next.js 16 with App Router
- React 19 (Server Components, `useOptimistic`, `useTransition`)
- TypeScript 5.9 (strict mode)
- Tailwind CSS v4
- Stripe (`@stripe/react-stripe-js` — Checkout Sessions + Elements)
- `@headkit/sdk` — Typed GraphQL client
- Zod — Runtime validation
- Radix UI — Accessible primitives
