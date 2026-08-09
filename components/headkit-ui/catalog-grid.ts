/**
 * Shared catalog/editorial listing grid — product, project, and post cards.
 * Column gap 30px; row gap 32px; 4 columns from `xl`.
 */
export const CATALOG_GRID_CLASS =
  "grid grid-cols-1 gap-x-[30px] gap-y-8 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";

/** Image `sizes` matching {@link CATALOG_GRID_CLASS} breakpoints. */
export const CATALOG_GRID_IMAGE_SIZES =
  "(max-width: 479px) 91vw, (max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw";

/**
 * Parent products fetched per PLP page. Divisible by every grid column count
 * (2 / 3 / 4) so collapsed (showVariants off) pages fill complete rows.
 */
export const CATALOG_PAGE_SIZE = 24;

/**
 * LCM of catalog grid columns (2×3×4). Expanded colourway cards and load-more
 * skeletons use multiples of this so every breakpoint shows full rows — no
 * trailing empty grid cells that look like blank cards.
 */
export const CATALOG_ROW_QUANTUM = 12;
