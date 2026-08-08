/**
 * Shared catalog/editorial listing grid — product, project, and post cards.
 * Column gap 30px; row gap 32px; 4 columns from `xl`.
 */
export const CATALOG_GRID_CLASS =
  "grid grid-cols-1 gap-x-[30px] gap-y-8 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4";

/** Image `sizes` matching {@link CATALOG_GRID_CLASS} breakpoints. */
export const CATALOG_GRID_IMAGE_SIZES =
  "(max-width: 479px) 91vw, (max-width: 767px) 50vw, (max-width: 1279px) 33vw, 25vw";
