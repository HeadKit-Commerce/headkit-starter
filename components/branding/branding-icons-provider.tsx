"use client";

import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  resolveBrandUiIcons,
  type BrandingIconLibrary,
  type BrandUiIcons,
  type ChromeIcons,
} from "@/components/icon/brand-icons";

const BrandingIconsContext = createContext<BrandUiIcons>(
  resolveBrandUiIcons("hi2"),
);

export function BrandingIconsProvider({
  library,
  children,
}: {
  library: BrandingIconLibrary | string | null | undefined;
  children: ReactNode;
}): ReactElement {
  const icons = resolveBrandUiIcons(library);
  return (
    <BrandingIconsContext.Provider value={icons}>
      {children}
    </BrandingIconsContext.Provider>
  );
}

/** Full UI icon set for the active branding library (ex-Heroicons 2). */
export function useBrandIcons(): BrandUiIcons {
  return useContext(BrandingIconsContext);
}

/** Chrome icon set for nav search / wishlist / account / cart. */
export function useChromeIcons(): ChromeIcons {
  const icons = useBrandIcons();
  return {
    Search: icons.Search,
    Heart: icons.Heart,
    User: icons.User,
    Cart: icons.Cart,
  };
}
