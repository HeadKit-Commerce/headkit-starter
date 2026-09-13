export interface ProductIdentifiersProps {
  gtin?: string | null | undefined;
  mpn?: string | null | undefined;
  className?: string;
}

/**
 * `GTIN: … MPN: …` line under the PDP details accordion, matching the old
 * site's shape (Bike Society PDP gap scout, item 21). Renders NOTHING when
 * both are missing — no empty labels — so a product (or a simple product's
 * page, or a store on a theme that predates the fields) with neither
 * identifier looks exactly as it did before this line existed.
 */
export function ProductIdentifiers({
  gtin,
  mpn,
  className,
}: ProductIdentifiersProps): React.ReactElement | null {
  const trimmedGtin = gtin?.trim() || null;
  const trimmedMpn = mpn?.trim() || null;

  if (!trimmedGtin && !trimmedMpn) {
    return null;
  }

  return (
    <p
      className={className ?? "text-sm text-gray-500"}
      data-testid="product-identifiers"
    >
      {trimmedGtin && <span>GTIN: {trimmedGtin}</span>}
      {trimmedGtin && trimmedMpn && <span>{"   "}</span>}
      {trimmedMpn && <span>MPN: {trimmedMpn}</span>}
    </p>
  );
}
