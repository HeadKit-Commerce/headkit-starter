/**
 * Side-effect import of vendored WordPress block library CSS.
 *
 * Kept in its own module so routes that only need HeadKit React blocks
 * (home commerce carousels, etc.) never pull ~153KB of unused `.wp-block-*`
 * rules into the critical CSS graph. Import this module from editorial
 * render paths that actually output WordPress HTML.
 */
import "@/app/_editorial/wp-block-library.css";

/** No-op marker so callers can `await import()` for side effects. */
export const EDITORIAL_STYLES_LOADED = true as const;
