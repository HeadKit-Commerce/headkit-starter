"use client";

import {
  createContext,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";
import {
  resolveChromeIcons,
  type BrandingIconLibrary,
  type ChromeIcons,
} from "@/components/icon/chrome-icons";

const BrandingIconsContext = createContext<ChromeIcons>(
  resolveChromeIcons("hi2"),
);

export function BrandingIconsProvider({
  library,
  children,
}: {
  library: BrandingIconLibrary | string | null | undefined;
  children: ReactNode;
}): ReactElement {
  const icons = resolveChromeIcons(library);
  return (
    <BrandingIconsContext.Provider value={icons}>
      {children}
    </BrandingIconsContext.Provider>
  );
}

/** Chrome icon set for nav search / wishlist / account / cart. */
export function useChromeIcons(): ChromeIcons {
  return useContext(BrandingIconsContext);
}
