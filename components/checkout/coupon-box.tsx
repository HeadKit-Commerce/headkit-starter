"use client";

import { useCallback, useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { CartFieldsFragment } from "@headkit/sdk";
import { Button } from "@/components/ui/button";
import {
  applyCouponAction,
  applyGiftCardAction,
  removeCouponAction,
} from "@/lib/cart-actions";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { useCheckoutActions } from "@/app/checkout/checkout-actions-context";
import { getFloatVal, formatPrice } from "@/lib/utils";
import { isGiftCardFormat, INVALID_CODE_MESSAGE } from "@/lib/gift-card-form";

const couponSchema = z.object({
  code: z.string().min(1, "Code is required"),
});

type CouponFormValues = z.infer<typeof couponSchema>;

interface CouponBoxProps {
  cart: CartFieldsFragment;
}

/**
 * Unified "Coupon Code or Gift Card" input. A single field + Apply button
 * discriminates on the 4-4-4-4 gift-card format (`isGiftCardFormat`): a matching
 * code is redeemed as a gift card, anything else is applied as a coupon. Both
 * branches route through `actions.runServerUpdate` so the Stripe session amount
 * re-syncs after the cart changes (GIFT-04). All errors funnel into one slot;
 * a non-gift-format code the coupon endpoint rejects shows a combined message
 * (it is neither a valid coupon nor a gift card). The applied-gift-card list is
 * rendered here (moved from the retired GiftRedeemBox) and is IDOR-safe — it
 * shows only this session cart's `appliedGiftCards`, never account balances.
 */
export const CouponBox = ({ cart }: CouponBoxProps) => {
  const { setCartData } = useCartContext();
  const { actions } = useCheckoutActions();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<CouponFormValues>({
    resolver: zodResolver(couponSchema),
  });

  const currency = cart.currency.code;

  const handleApply = useCallback<SubmitHandler<CouponFormValues>>(
    async ({ code }) => {
      setErrorMessage("");
      setIsLoading(true);
      const trimmed = code.trim();
      const isGiftCard = isGiftCardFormat(trimmed);

      // Gift-format codes are redeemed as gift cards and keep their specific
      // server error; freeform codes go to the coupon endpoint and, on failure,
      // show the combined "neither coupon nor gift card" message.
      const runApply = async (): Promise<void> => {
        // keepCheckoutSession: coupon box is checkout-mounted — the sync
        // effect re-syncs the live session's line items afterwards (ENG-784).
        const result = isGiftCard
          ? await applyGiftCardAction(trimmed, { keepCheckoutSession: true })
          : await applyCouponAction(trimmed, { keepCheckoutSession: true });
        if (!result.success) {
          throw new Error(isGiftCard ? result.error : INVALID_CODE_MESSAGE);
        }
        setCartData(result.cart);
      };

      try {
        if (actions) {
          const updateResult = await actions.runServerUpdate(runApply);
          if (updateResult.type === "error") {
            setErrorMessage(
              updateResult.error?.message ??
                (isGiftCard
                  ? "Failed to apply gift card"
                  : INVALID_CODE_MESSAGE),
            );
            return;
          }
          reset();
        } else {
          await runApply();
          reset();
        }
      } catch (err) {
        setErrorMessage(
          err instanceof Error
            ? err.message
            : isGiftCard
              ? "Failed to apply gift card"
              : INVALID_CODE_MESSAGE,
        );
      } finally {
        setIsLoading(false);
      }
    },
    [setCartData, reset, actions],
  );

  const handleRemove = useCallback(
    async (code: string) => {
      setErrorMessage("");
      try {
        if (actions) {
          const updateResult = await actions.runServerUpdate(async () => {
            const result = await removeCouponAction(code, {
              keepCheckoutSession: true,
            });
            if (!result.success) throw new Error(result.error);
            setCartData(result.cart);
          });
          if (updateResult.type === "error") {
            setErrorMessage(
              updateResult.error?.message ?? "Failed to remove coupon",
            );
          }
        } else {
          const result = await removeCouponAction(code, {
            keepCheckoutSession: true,
          });
          if (result.success) {
            setCartData(result.cart);
          } else {
            setErrorMessage(result.error);
          }
        }
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to remove coupon",
        );
      }
    },
    [setCartData, actions],
  );

  return (
    <div>
      {cart.coupons.length > 0 && (
        <div className="mb-3 space-y-2">
          {cart.coupons.map((coupon) => (
            <div key={coupon.code} className="flex text-base font-medium py-1">
              <p className="flex-1">Coupon: {coupon.code}</p>
              <p>−{formatPrice(getFloatVal(coupon.totalDiscount), currency)}</p>
              <button
                type="button"
                className="underline font-medium ml-2 cursor-pointer text-sm"
                onClick={() => handleRemove(coupon.code)}
              >
                [remove]
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Applied gift cards (moved from the retired GiftRedeemBox). IDOR-safe:
          only this session cart's appliedGiftCards are shown (T-09-04). */}
      {cart.appliedGiftCards.length > 0 && (
        <div className="mb-3 space-y-2">
          {cart.appliedGiftCards.map((giftCard) => (
            <div
              key={giftCard.id}
              className="flex flex-wrap text-base font-medium py-1"
            >
              {/* `code` may be masked by the plugin (••••-••••-••••-7GH8); we
                  display it verbatim and never log it (T-09-03). */}
              <p className="flex-1">Gift card: {giftCard.code}</p>
              <p>−{formatPrice(getFloatVal(giftCard.amount), currency)}</p>
              <p className="w-full text-sm font-normal text-gray-500">
                Remaining balance:{" "}
                {formatPrice(getFloatVal(giftCard.balance), currency)}
              </p>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit(handleApply)}>
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <input
              {...register("code")}
              type="text"
              placeholder="Coupon Code or Gift Card"
              className="w-full p-2 border rounded"
            />
            {errors.code && (
              <p className="text-red-500 text-sm mt-1">{errors.code.message}</p>
            )}
          </div>
          <Button
            variant="secondary"
            disabled={isLoading}
            loading={isLoading}
            loadingText="Applying..."
            className="max-w-[170px]"
            type="submit"
          >
            Apply
          </Button>
        </div>
      </form>

      {errorMessage && (
        <p className="text-red-500 text-sm mt-2">{errorMessage}</p>
      )}
    </div>
  );
};
