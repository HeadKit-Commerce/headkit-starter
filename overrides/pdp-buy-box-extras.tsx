import type { ReactNode } from "react";

export type PdpBuyBoxExtraOption = {
  name: string;
  slug: string;
  swatchColor?: string | null;
};

/**
 * Extra block after the PDP buy-box grid, before the sticky add-to-cart bar.
 * Customer-owned. `product-detail.tsx` is a client component, so this module
 * must stay free of server-only imports.
 */
export function PdpBuyBoxExtras(_props: {
  selectedColor: string | undefined;
  options: ReadonlyArray<PdpBuyBoxExtraOption>;
}): ReactNode {
  return null;
}
