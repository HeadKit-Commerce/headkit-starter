"use client";

import { useCallback, useState } from "react";
import { useForm, SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { CartFieldsFragment } from "@headkit/sdk";
import { Button } from "@/components/ui/button";
import { applyCouponAction, removeCouponAction } from "@/lib/cart-actions";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { useCheckoutActions } from "@/app/checkout/checkout-actions-context";
import { getFloatVal, formatPrice } from "@/lib/utils";

const couponSchema = z.object({
  code: z.string().min(1, "Code is required"),
});

type CouponFormValues = z.infer<typeof couponSchema>;

interface CouponBoxProps {
  cart: CartFieldsFragment;
}

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

  const handleApply = useCallback<SubmitHandler<CouponFormValues>>(
    async ({ code }) => {
      setErrorMessage("");
      setIsLoading(true);
      try {
        if (actions) {
          const updateResult = await actions.runServerUpdate(async () => {
            const result = await applyCouponAction(code.trim());
            if (!result.success) throw new Error(result.error);
            setCartData(result.cart);
          });
          if (updateResult.type === "error") {
            setErrorMessage(
              updateResult.error?.message ?? "Failed to apply coupon",
            );
            return;
          }
          reset();
        } else {
          const result = await applyCouponAction(code.trim());
          if (result.success) {
            setCartData(result.cart);
            reset();
          } else {
            setErrorMessage(result.error);
          }
        }
      } catch (err) {
        setErrorMessage(
          err instanceof Error ? err.message : "Failed to apply coupon",
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
            const result = await removeCouponAction(code);
            if (!result.success) throw new Error(result.error);
            setCartData(result.cart);
          });
          if (updateResult.type === "error") {
            setErrorMessage(
              updateResult.error?.message ?? "Failed to remove coupon",
            );
          }
        } else {
          const result = await removeCouponAction(code);
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

  const currency = cart.currency.code;

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

      <form onSubmit={handleSubmit(handleApply)}>
        <div className="flex gap-3 items-start">
          <div className="flex-1">
            <input
              {...register("code")}
              type="text"
              placeholder="Coupon Code"
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
