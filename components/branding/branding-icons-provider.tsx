"use client";

import {
  createContext,
  use,
  useContext,
  type ReactElement,
  type ReactNode,
} from "react";
import { resolveBrandUiIcons } from "@/components/icon/brand-icons";
import { loadBrandUiIcons } from "@/components/icon/load-brand-icons";
import type {
  BrandUiIcons,
  ChromeIcons,
} from "@/components/icon/brand-icon-packs/types";

const BrandingIconsContext = createContext<BrandUiIcons>(
  resolveBrandUiIcons("hi2"),
);

/** Deduplicate dynamic pack loads across Strict Mode / remounts. */
const iconPackPromises = new Map<string, Promise<BrandUiIcons>>();

function brandIconsPromise(
  library: string | null | undefined,
): Promise<BrandUiIcons> {
  const key = library?.trim() || "hi2";
  const existing = iconPackPromises.get(key);
  if (existing) return existing;
  const promise = loadBrandUiIcons(key);
  iconPackPromises.set(key, promise);
  return promise;
}

/**
 * Loads only the selected react-icons pack (dynamic import). Pass `library`
 * from the server — do not pass icon components across the RSC boundary.
 */
export function BrandingIconsProvider({
  library,
  children,
}: {
  library: string | null | undefined;
  children: ReactNode;
}): ReactElement {
  const icons = use(brandIconsPromise(library));
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

/** Chrome icon set for nav search / wishlist / account / cart / phone. */
export function useChromeIcons(): ChromeIcons {
  const brandIcons = useBrandIcons();
  return {
    Search: brandIcons.Search,
    Heart: brandIcons.Heart,
    User: brandIcons.User,
    Cart: brandIcons.Cart,
    Phone: brandIcons.Phone,
  };
}
