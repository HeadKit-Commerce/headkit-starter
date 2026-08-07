"use client";

import { createContext, useContext, type ReactNode } from "react";
import {
  DEFAULT_CHECKOUT_MODE,
  isQuoteMode,
  type CheckoutMode,
} from "@/lib/checkout-mode";

const CheckoutModeContext = createContext<CheckoutMode>(DEFAULT_CHECKOUT_MODE);

interface CheckoutModeProviderProps {
  mode: CheckoutMode;
  children: ReactNode;
}

/**
 * Provides the dashboard-selected checkout experience to client components.
 */
export function CheckoutModeProvider({
  mode,
  children,
}: CheckoutModeProviderProps): React.JSX.Element {
  return (
    <CheckoutModeContext.Provider value={mode}>
      {children}
    </CheckoutModeContext.Provider>
  );
}

/**
 * Current checkout mode (`custom` | `quote`).
 */
export function useCheckoutMode(): CheckoutMode {
  return useContext(CheckoutModeContext);
}

/**
 * Convenience: true when HeadKit Quote is active.
 */
export function useIsQuoteMode(): boolean {
  return isQuoteMode(useCheckoutMode());
}
