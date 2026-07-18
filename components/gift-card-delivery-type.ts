/**
 * Gift card delivery options (WooCommerce Gift Cards extension field values).
 *
 * Lives in its own module so product-detail can reference the enum without
 * statically importing gift-card-form.tsx — that module drags react-hook-form
 * + zod into every PDP bundle even for non-gift-card products (RC-1 perf fix;
 * the form component itself is lazy-loaded).
 */
export enum DeliveryType {
  Now = "1",
  Later = "2",
}
