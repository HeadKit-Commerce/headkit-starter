/**
 * Customer-owned maintenance-page content.
 *
 * The storefront serves this page — with HTTP `503` — while the store is in
 * maintenance mode (see `MAINTENANCE.md` and `lib/maintenance.ts`). Edit this
 * file to brand the page; platform template upgrades leave `overrides/` alone.
 *
 * Two hard constraints, both of which exist because this page has to render on
 * the worst day the store will ever have:
 *
 *  1. **No imports.** This module is bundled into the request-time proxy.
 *     Importing React, `@/lib/*`, or anything that reaches the API would make
 *     the maintenance page depend on the systems that are being changed during
 *     the window — the exact failure this gate exists to avoid.
 *  2. **No remote assets.** Every value below is inlined into one
 *     self-contained HTML document. A logo must be a same-origin path under
 *     `public/` (served straight from the CDN, never gated) or a `data:` URI —
 *     never a dashboard/WordPress URL.
 *
 * Every string is HTML-escaped before it is rendered, so plain text is safe and
 * markup is not honoured.
 *
 * Copy can also be set per-window from Edge Config without touching this file
 * (`headline` / `message` on the flag value) — that wins over what is here.
 */
export interface MaintenanceContent {
  /** Browser tab title. */
  title?: string;
  /** Large heading on the page. */
  headline?: string;
  /** One or two sentences under the heading. */
  message?: string;
  /** Small print under the message (e.g. a phone number or email). */
  footer?: string;
  /** Same-origin path (e.g. `/icon-default.svg`) or `data:` URI. No remote URLs. */
  logoSrc?: string;
  /** Page background colour (any CSS colour). */
  background?: string;
  /** Body text colour. */
  foreground?: string;
  /** Heading / accent colour. */
  accent?: string;
}

/**
 * Store-specific overrides. Empty by default — the starter ships the neutral
 * copy in `lib/maintenance.ts`.
 *
 * Example:
 *
 * ```ts
 * export const maintenanceContent: MaintenanceContent = {
 *   title: "Dishee — back shortly",
 *   headline: "We're back shortly",
 *   message: "Our shop is briefly offline while we upgrade it. Orders already placed are safe.",
 *   footer: "Need us now? hello@dishee.com.au",
 *   logoSrc: "/icon-default.svg",
 *   background: "#f6f4ef",
 *   accent: "#2d4236",
 * };
 * ```
 */
export const maintenanceContent: MaintenanceContent = {};
