"use client";

import type { CartFieldsFragment } from "@headkit/sdk";
import { CouponBox } from "@/components/checkout/coupon-box";
import { LineItemDisplay } from "@/components/checkout/line-item-display";
import { getFloatVal, formatPrice } from "@/lib/utils";
import { useCartContext } from "@/components/headkit-ui/cart-context";

interface Props {
  showDisplayShipping?: boolean;
}

const Cart = ({ showDisplayShipping }: Props) => {
  const { cartData } = useCartContext();

  if (!cartData) return null;

  const currency = cartData.currency.code;

  const shippingCost =
    getFloatVal(cartData.totals.totalShipping) +
    getFloatVal(cartData.totals.totalShippingTax);

  const calculateShipping = () => {
    if (!showDisplayShipping) {
      return (
        <span className="font-normal text-base">Calculated at next step</span>
      );
    }
    return shippingCost === 0 ? "Free" : formatPrice(shippingCost, currency);
  };

  const calculateTotal = () => {
    const total = getFloatVal(cartData.totals.totalPrice);
    return showDisplayShipping
      ? formatPrice(total, currency)
      : formatPrice(total - shippingCost, currency);
  };

  return (
    <div>
      {/* Cart items */}
      <div className="space-y-[20px]">
        {cartData.items.map((item, i) => (
          <LineItemDisplay
            key={i}
            name={item.name}
            images={item.images}
            variation={item.variation ?? []}
            quantity={item.quantity}
            lineSubtotal={item.totals.lineSubtotal}
            currency={currency}
            giftCard={item.giftCard ?? null}
          />
        ))}
      </div>

      {/* Unified coupon / gift-card redemption. One input discriminates on the
          gift-card format; applying either re-syncs the Stripe session amount
          via the shared checkout-actions context. */}
      <div className="mt-[32px] mb-[20px] space-y-[16px]">
        <CouponBox cart={cartData as CartFieldsFragment} />
      </div>

      {/* Totals */}
      <div className="flex justify-between font-medium">
        <p>Subtotal</p>
        <p>{formatPrice(getFloatVal(cartData.totals.totalItems), currency)}</p>
      </div>

      {getFloatVal(cartData.totals.totalDiscount) > 0 && (
        <div className="flex justify-between font-medium mt-[8px]">
          <p>Discount</p>
          <p>
            −{formatPrice(getFloatVal(cartData.totals.totalDiscount), currency)}
          </p>
        </div>
      )}

      <div className="flex justify-between font-medium mt-[8px]">
        <p>Shipping</p>
        <p>{calculateShipping()}</p>
      </div>

      {getFloatVal(cartData.totals.totalTax) > 0 && (
        <div className="flex justify-between font-medium mt-[8px]">
          <p>Tax</p>
          <p>{formatPrice(getFloatVal(cartData.totals.totalTax), currency)}</p>
        </div>
      )}

      <div className="flex justify-between text-xl mt-[20px]">
        <div>
          <p className="font-medium">Total</p>
        </div>
        <div className="text-right font-medium">
          <p>{calculateTotal()}</p>
        </div>
      </div>
    </div>
  );
};

export { Cart };
