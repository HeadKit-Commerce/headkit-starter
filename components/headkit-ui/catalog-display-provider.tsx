"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { CatalogDisplayPrefs } from "@/lib/catalog-display";

const DEFAULT_PREFS: CatalogDisplayPrefs = {
  showVariants: true,
  showSwatches: false,
  imageRollover: false,
};

const CatalogDisplayContext = createContext<CatalogDisplayPrefs>(DEFAULT_PREFS);

interface Props {
  prefs: CatalogDisplayPrefs;
  children: ReactNode;
}

/**
 * Provides product-collection display prefs (variants / swatches / rollover)
 * from dashboard branding to client catalog surfaces.
 */
export function CatalogDisplayProvider({
  prefs,
  children,
}: Props): React.JSX.Element {
  return (
    <CatalogDisplayContext.Provider value={prefs}>
      {children}
    </CatalogDisplayContext.Provider>
  );
}

export function useCatalogDisplay(): CatalogDisplayPrefs {
  return useContext(CatalogDisplayContext);
}
