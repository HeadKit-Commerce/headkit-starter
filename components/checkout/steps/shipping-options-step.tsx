"use client";

import { useCallback, useEffect, useState } from "react";
import type { CartFieldsFragment } from "@headkit/sdk";
import { Button } from "@/components/ui/button";
import { selectShippingAction } from "@/lib/cart-actions";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SpinnerIcon } from "@/components/icon";
import { getFloatVal, formatPrice } from "@/lib/utils";
import { useCartContext } from "@/components/headkit-ui/cart-context";
import { useCheckoutActions } from "@/app/checkout/checkout-actions-context";

type ShippingRate =
  CartFieldsFragment["shippingRates"][number]["shippingRates"][number];
type ShippingRateWithPackage = ShippingRate & { packageId: string };

type ShippingOptionMappingItem = {
  rateId: string;
  stripeShippingRateId: string;
};

interface Props {
  onNext: (data: {
    shippingPackageId: string;
    shippingRateId: string;
    shippingRateName: string;
  }) => void;
  buttonLabel: string;
  /** Required for inline sync to get fresh mapping before updateShippingOption. */
  sessionId: string;
  /** Maps cart rateId to Stripe shipping rate ID. Used for UI labels only; update path uses fresh mapping from inline sync. */
  shippingOptionMapping?: ShippingOptionMappingItem[];
}

export const ShippingOptionsStep = ({
  onNext,
  buttonLabel,
  sessionId,
  shippingOptionMapping,
}: Props) => {
  const { cartData, setCartData } = useCartContext();
  const { actions } = useCheckoutActions();
  const [isLoading, setIsLoading] = useState(false);
  const [activeRateId, setActiveRateId] = useState<string | null>(null);
  const [shippingRates, setShippingRates] = useState<ShippingRateWithPackage[]>(
    [],
  );

  // Flatten shipping rates across packages, excluding pickup (handled in Delivery step)
  useEffect(() => {
    if (!cartData?.shippingRates) return;

    const rates: ShippingRateWithPackage[] = [];
    for (const pkg of cartData.shippingRates) {
      for (const rate of pkg.shippingRates) {
        if (
          !rate.rateId.includes("local_pickup") &&
          !rate.rateId.includes("pickup_location")
        ) {
          rates.push({ ...rate, packageId: pkg.packageId });
        }
      }
    }
    setShippingRates(rates);

    // Pre-select the currently chosen rate
    const selected = rates.find((r) => r.selected);
    if (selected) setActiveRateId(selected.rateId);
  }, [cartData?.shippingRates]);

  const handleSelectRate = useCallback(
    async (packageId: string, rateId: string) => {
      setIsLoading(true);
      setActiveRateId(rateId);
      try {
        const act = actions;
        if (act) {
          const updateResult = await act.runServerUpdate(async () => {
            // keepCheckoutSession: checkout-mounted — the inline sync below
            // re-syncs the live session (ENG-784).
            const result = await selectShippingAction(packageId, rateId, {
              keepCheckoutSession: true,
            });
            if (!result.success) throw new Error(result.error);
            setCartData(result.cart);
          });
          if (updateResult.type === "error") {
            throw new Error(
              updateResult.error?.message ?? "Failed to select shipping",
            );
          }
          // Sync to Stripe immediately to get fresh mapping (Stripe recreates shipping rate IDs on every update).
          // Using the sync effect's mapping would race — we call updateShippingOption before the effect runs.
          let freshMapping: ShippingOptionMappingItem[] = [];
          try {
            const res = await fetch("/api/checkout/sync-line-items", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sessionId }),
            });
            if (res.ok) {
              const data = (await res.json()) as {
                shippingOptionMapping?: ShippingOptionMappingItem[] | null;
              };
              freshMapping = data.shippingOptionMapping ?? [];
            }
          } catch {
            // Inline sync failed; will use existing mapping or skip updateShippingOption
          }
          const stripeId = freshMapping.find(
            (m) => m.rateId === rateId,
          )?.stripeShippingRateId;
          if (stripeId && act.updateShippingOption) {
            await act.updateShippingOption(stripeId).catch((err) => {
              return { type: "error" as const, error: err };
            });
          }
        } else {
          const result = await selectShippingAction(packageId, rateId, {
            keepCheckoutSession: true,
          });
          if (result.success) setCartData(result.cart);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [setCartData, actions, sessionId],
  );

  const syncShippingToStripe = useCallback(
    async (rateId: string): Promise<void> => {
      const act = actions;
      if (!act) return;
      const selectedRate = shippingRates.find((r) => r.rateId === rateId);
      if (!selectedRate) return;
      const updateResult = await act.runServerUpdate(async () => {
        const result = await selectShippingAction(
          selectedRate.packageId,
          rateId,
          { keepCheckoutSession: true },
        );
        if (!result.success) throw new Error(result.error);
        setCartData(result.cart);
      });
      if (updateResult.type === "error") {
        throw new Error(
          updateResult.error?.message ?? "Failed to select shipping",
        );
      }
      let freshMapping: ShippingOptionMappingItem[] = [];
      try {
        const res = await fetch("/api/checkout/sync-line-items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });
        if (res.ok) {
          const data = (await res.json()) as {
            shippingOptionMapping?: ShippingOptionMappingItem[] | null;
          };
          freshMapping = data.shippingOptionMapping ?? [];
        }
      } catch {
        // Inline sync failed; will skip updateShippingOption
      }
      const stripeId = freshMapping.find(
        (m) => m.rateId === rateId,
      )?.stripeShippingRateId;
      if (stripeId && act.updateShippingOption) {
        await act
          .updateShippingOption(stripeId)
          .catch(() => ({ type: "error" as const, error: undefined }));
      }
    },
    [actions, shippingRates, sessionId, setCartData],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRateId) return;
    const selectedRate = shippingRates.find((r) => r.rateId === activeRateId);
    if (!selectedRate) return;
    if (actions) {
      setIsLoading(true);
      try {
        await syncShippingToStripe(activeRateId);
      } finally {
        setIsLoading(false);
      }
    }
    onNext({
      shippingPackageId: selectedRate.packageId,
      shippingRateId: selectedRate.rateId,
      shippingRateName: selectedRate.name,
    });
  };

  if (!cartData?.shippingRates) {
    return (
      <div className="flex justify-center py-4">
        <SpinnerIcon className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const currency = cartData.currency.code;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {shippingRates.length > 0 ? (
        <div className="relative grid grid-cols-1 gap-3">
          <RadioGroup
            value={activeRateId ?? null}
            onValueChange={(value) => {
              const rate = shippingRates.find((r) => r.rateId === value);
              if (rate) handleSelectRate(rate.packageId, rate.rateId);
            }}
          >
            <div className="space-y-2">
              {shippingRates.map((rate) => {
                const totalCost =
                  getFloatVal(rate.price) + getFloatVal(rate.taxes);
                return (
                  <div
                    key={rate.rateId}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent"
                  >
                    <div className="flex items-center gap-x-2">
                      <RadioGroupItem value={rate.rateId} id={rate.rateId} />
                      <label
                        htmlFor={rate.rateId}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {rate.name}
                      </label>
                    </div>
                    <span className="text-muted-foreground">
                      {totalCost === 0
                        ? "Free"
                        : formatPrice(totalCost, currency)}
                    </span>
                  </div>
                );
              })}
            </div>
          </RadioGroup>
          {isLoading && (
            <div className="absolute inset-0 bg-white/50 flex items-center justify-center">
              <SpinnerIcon className="h-6 w-6 animate-spin" />
            </div>
          )}
        </div>
      ) : (
        <p>Sorry, shipping is not currently available for this order.</p>
      )}

      <Button
        type="submit"
        disabled={!activeRateId || isLoading}
        className="w-full"
        rightIcon="arrowRight"
      >
        {buttonLabel}
      </Button>
    </form>
  );
};
