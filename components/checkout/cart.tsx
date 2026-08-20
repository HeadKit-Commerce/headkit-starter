"use client";

import type { CartFieldsFragment } from "@headkit/sdk";
import { CouponBox } from "@/components/checkout/coupon-box";
import { LineItemDisplay } from "@/components/checkout/line-item-display";
import {
  cartDiscountDisplayTotal,
  cartItemsDisplayTotal,
  lineDisplayTotal,
  shippingDisplayTotal,
} from "@/lib/cart-prices";
import { getFloatVal, formatPrice } from "@/lib/utils";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { useIsQuoteMode } from "@/components/checkout/checkout-mode-provider";

interface Props {
  showDisplayShipping?: boolean;
}

const Cart = ({ showDisplayShipping }: Props) => {
  const { cartData } = useCartContext();
  const isQuoteMode = useIsQuoteMode();

  if (!cartData) return null;

  const currency = cartData.currency.code;

  const shippingCost = shippingDisplayTotal(cartData);

  const discount = cartDiscountDisplayTotal(cartData);

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
            lineTotal={lineDisplayTotal(item.totals, null, cartData)}
            currency={currency}
            giftCard={item.giftCard ?? null}
            addons={item.addons}
            hideLineTotal={isQuoteMode}
            hideAddonPrices={isQuoteMode}
          />
        ))}
      </div>

      {!isQuoteMode && (
        <>
          {/* Unified coupon / gift-card redemption. One input discriminates on the
              gift-card format; applying either re-syncs the Stripe session amount
              via the shared checkout-actions context. */}
          <div className="mt-[32px] mb-[20px] space-y-[16px]">
            <CouponBox cart={cartData as CartFieldsFragment} />
          </div>

          {/* Totals. Subtotal, Discount and Shipping are all tax-INCLUSIVE, so
              they reconcile against the inclusive line rows above and the
              inclusive Total below; the tax row beneath them is informational,
              not another addend. */}
          <div className="flex justify-between font-medium">
            <p>Subtotal</p>
            <p>{formatPrice(cartItemsDisplayTotal(cartData), currency)}</p>
          </div>

          {discount > 0 && (
            <div className="flex justify-between font-medium mt-[8px]">
              <p>Discount</p>
              <p>−{formatPrice(discount, currency)}</p>
            </div>
          )}

          <div className="flex justify-between font-medium mt-[8px]">
            <p>Shipping</p>
            <p>{calculateShipping()}</p>
          </div>

          {getFloatVal(cartData.totals.totalTax) > 0 && (
            <div className="flex justify-between font-medium mt-[8px]">
              <p>Includes tax</p>
              <p>
                {formatPrice(getFloatVal(cartData.totals.totalTax), currency)}
              </p>
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
        </>
      )}
    </div>
  );
};

export { Cart };
