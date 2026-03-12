"use client";

import {
  createContext,
  useContext,
  useState,
  useOptimistic,
  useTransition,
  useCallback,
  type ReactNode,
} from "react";
import type { CartFieldsFragment } from "@headkit/sdk";

type CartData = CartFieldsFragment;

type OptimisticAction =
  | { type: "update_quantity"; key: string; quantity: number }
  | { type: "remove_item"; key: string }
  | { type: "set_cart"; cart: CartData };

interface CartContextValue {
  cartData: CartData | null;
  optimisticCart: CartData | null;
  setCartData: (cart: CartData | null) => void;
  cartOpen: boolean;
  toggleCart: (open?: boolean) => void;
  isPending: boolean;
  optimisticUpdateQuantity: (key: string, quantity: number) => void;
  optimisticRemoveItem: (key: string) => void;
  startCartTransition: (fn: () => Promise<void>) => void;
}

const CartContext = createContext<CartContextValue | null>(null);

function cartReducer(
  state: CartData | null,
  action: OptimisticAction,
): CartData | null {
  if (!state) return state;

  switch (action.type) {
    case "update_quantity":
      return {
        ...state,
        items: state.items.map((item) =>
          item.key === action.key
            ? { ...item, quantity: action.quantity }
            : item,
        ),
      };
    case "remove_item":
      return {
        ...state,
        items: state.items.filter((item) => item.key !== action.key),
        itemsCount: state.itemsCount - 1,
      };
    case "set_cart":
      return action.cart;
    default:
      return state;
  }
}

export function CartProvider({
  children,
  initialCart,
}: {
  children: ReactNode;
  initialCart?: CartData | null;
}) {
  const [cartData, setCartDataInternal] = useState<CartData | null>(
    initialCart ?? null,
  );
  const [cartOpen, setCartOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const [optimisticCart, addOptimistic] = useOptimistic<
    CartData | null,
    OptimisticAction
  >(cartData, cartReducer);

  const setCartData = useCallback((cart: CartData | null) => {
    setCartDataInternal(cart);
  }, []);

  const toggleCart = useCallback((open?: boolean) => {
    setCartOpen((prev) => (open !== undefined ? open : !prev));
  }, []);

  const optimisticUpdateQuantity = useCallback(
    (key: string, quantity: number) => {
      addOptimistic({ type: "update_quantity", key, quantity });
    },
    [addOptimistic],
  );

  const optimisticRemoveItem = useCallback(
    (key: string) => {
      addOptimistic({ type: "remove_item", key });
    },
    [addOptimistic],
  );

  const startCartTransition = useCallback(
    (fn: () => Promise<void>) => {
      startTransition(async () => {
        await fn();
      });
    },
    [startTransition],
  );

  return (
    <CartContext.Provider
      value={{
        cartData,
        optimisticCart,
        setCartData,
        cartOpen,
        toggleCart,
        isPending,
        optimisticUpdateQuantity,
        optimisticRemoveItem,
        startCartTransition,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCartContext(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) {
    throw new Error("useCartContext must be used within CartProvider");
  }
  return ctx;
}
