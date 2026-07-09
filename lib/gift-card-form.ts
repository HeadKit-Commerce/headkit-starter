import { z } from "zod";

/**
 * A gift-card code is 19 chars in 4-4-4-4 form (e.g. `TEST-GIFT-CARD-0001`):
 * four hyphen-separated groups of four alphanumerics. The WooCommerce Gift
 * Cards plugin rejects anything else with `woocommerce_blocks_gift_card_invalid`
 * (RESEARCH Pitfall 2), so we validate the format client-side before redeeming.
 */
export const GIFT_CARD_CODE_REGEX =
  /^[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}-[A-Za-z0-9]{4}$/;

/** Zod schema for the redeem-box form (react-hook-form + zodResolver). */
export const giftCardSchema = z.object({
  code: z
    .string()
    .trim()
    .regex(GIFT_CARD_CODE_REGEX, "Enter a valid gift card code"),
});

export type GiftCardFormValues = z.infer<typeof giftCardSchema>;

/**
 * Discriminator for the unified "Coupon Code or Gift Card" input: a code that
 * matches the 4-4-4-4 gift-card format is routed to the gift-card apply path;
 * anything else (freeform coupon codes) is routed to the coupon apply path.
 * Trims first so surrounding whitespace never misroutes the code. Single source
 * of the regex — do not re-declare the pattern in components.
 */
export const isGiftCardFormat = (code: string): boolean =>
  GIFT_CARD_CODE_REGEX.test(code.trim());

/**
 * Shown when a non-gift-format code is rejected by the coupon endpoint: it is
 * neither a valid coupon nor a gift-card code. Improves on the reference
 * implementation (which surfaces only the endpoint-specific error).
 */
export const INVALID_CODE_MESSAGE =
  "That code isn't a valid coupon or gift card.";
