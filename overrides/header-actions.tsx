"use client";

/**
 * Extra desktop header actions (rendered between Account and Cart).
 * Customer-owned — edit this file instead of core `header-actions.tsx`.
 *
 * Example (phone icon from dashboard branding library):
 *
 * ```tsx
 * import { Button } from "@/components/ui/button";
 * import { useChromeIcons } from "@/components/branding/branding-icons-provider";
 *
 * export function HeaderActionExtras() {
 *   const { Phone } = useChromeIcons();
 *   return (
 *     <Button variant="ghost" size="icon" aria-label="Call us" className="h-9 w-9 justify-end pr-0" asChild>
 *       <a href="tel:+61123456789">
 *         <Phone className="h-6 w-6 text-primary transition-opacity hover:opacity-70" />
 *       </a>
 *     </Button>
 *   );
 * }
 * ```
 */
export function HeaderActionExtras(): null {
  return null;
}

/**
 * Extra mobile sheet header actions (rendered after Account).
 */
export function MobileHeaderActionExtras(): null {
  return null;
}
