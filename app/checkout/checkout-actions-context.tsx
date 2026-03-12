"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useCheckout } from "@stripe/react-stripe-js/checkout";

/** Stripe Checkout actions from loadActions() - used to update session on client */
export type CheckoutActions = {
  updateEmail: (email: string) => Promise<{
    type: "success" | "error";
    session?: unknown;
    error?: { message: string };
  }>;
  updateShippingAddress: (addr: {
    name?: string;
    address: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country: string;
    };
  }) => Promise<{
    type: "success" | "error";
    session?: unknown;
    error?: { message: string };
  }>;
  updateBillingAddress: (addr: {
    name?: string;
    address: {
      line1?: string;
      line2?: string;
      city?: string;
      state?: string;
      postal_code?: string;
      country: string;
    };
  }) => Promise<{
    type: "success" | "error";
    session?: unknown;
    error?: { message: string };
  }>;
  updateShippingOption: (optionId: string) => Promise<{
    type: "success" | "error";
    session?: unknown;
    error?: { message: string };
  }>;
  updatePhoneNumber: (phone: string) => Promise<{
    type: "success" | "error";
    session?: unknown;
    error?: { message: string };
  }>;
  runServerUpdate: (fn: () => Promise<void>) => Promise<{
    type: "success" | "error";
    session?: unknown;
    error?: { message: string };
  }>;
};

const CheckoutActionsContext = createContext<{
  actions: CheckoutActions | null;
  isLoading: boolean;
}>({ actions: null, isLoading: true });

export function useCheckoutActions() {
  return useContext(CheckoutActionsContext);
}

export function CheckoutActionsProvider({ children }: { children: ReactNode }) {
  const checkoutState = useCheckout();
  const [actions, setActions] = useState<CheckoutActions | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (checkoutState.type !== "success") {
      setIsLoading(checkoutState.type === "loading");
      return;
    }
    const checkout = checkoutState.checkout;

    if (!actions) {
      setActions({
        updateEmail: checkout.updateEmail,
        updateShippingAddress: checkout.updateShippingAddress,
        updateBillingAddress: checkout.updateBillingAddress,
        updateShippingOption: checkout.updateShippingOption,
        updatePhoneNumber: checkout.updatePhoneNumber,
        runServerUpdate: checkout.runServerUpdate,
      });
    }

    setIsLoading(false);
  }, [checkoutState]);

  return (
    <CheckoutActionsContext.Provider value={{ actions, isLoading }}>
      {children}
    </CheckoutActionsContext.Provider>
  );
}
