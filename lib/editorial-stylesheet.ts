import { createHash } from "node:crypto";

/**
 * The vendored WordPress block-library stylesheet, served as a STATIC ASSET
 * rather than imported into the module graph — and the reason is that an
 * import cannot be gated per route.
 *
 * Next collects the CSS for a server-rendered route from its MODULE GRAPH, at
 * build time. A dynamic `await import()` of a CSS side-effect module does not
 * change that: the specifier is a literal, the bundler resolves it
 * statically, and the stylesheet lands in that route's render-blocking
 * `<link>` set whether or not the branch that imports it ever runs. So
 * `BlockEditor`'s runtime gate only ever decided the stylesheet for routes
 * that do not import `BlockEditor` / `EditorialContent` AT ALL — `/shop`,
 * `/collections/*`, `/checkout`. Every route that CAN render WordPress prose
 * paid it on every request, the home page included.
 *
 * `<EditorialStylesheet />` (components/headkit-ui/editorial-stylesheet.tsx)
 * is React 19's own mechanism for "this stylesheet belongs to whatever
 * rendered me": a `<link rel="stylesheet" precedence>` React hoists into
 * `<head>` and blocks the reveal on, emitted only when a component that
 * actually renders WordPress HTML renders it. Rendering it twice is free —
 * React dedupes by href.
 *
 * The file is CONTENT-ADDRESSED so `next.config.ts` can serve it `immutable`;
 * `editorial-stylesheet.test.ts` fails if the bytes and the name disagree.
 *
 * PROVENANCE. `public/editorial/wp-block-library.<hash>.css` is the vendored
 * WordPress core `block-library/style.css` that used to live at
 * `app/_editorial/wp-block-library.css` (196,481 B), minified with the same
 * minifier the Next build used to apply to it:
 *
 *   node -e 'const{transform}=require("lightningcss");const fs=require("node:fs");
 *     const out=transform({filename:"wp-block-library.css",
 *       code:fs.readFileSync("<source>.css"),minify:true});
 *     fs.writeFileSync("public/editorial/wp-block-library.<hash>.css",out.code)'
 *
 * To update it: minify the new vendor file, rename it to its new hash, and
 * change `EDITORIAL_STYLESHEET_HREF` to match. The test tells you the hash.
 */
export const EDITORIAL_STYLESHEET_HREF =
  "/editorial/wp-block-library.fe9890e1.css";

/** React precedence bucket. Ordered after Next's own "next" stylesheets. */
export const EDITORIAL_STYLESHEET_PRECEDENCE = "editorial";

/** The content-address the file name has to carry. */
export function editorialStylesheetHash(css: Buffer | string): string {
  return createHash("sha256").update(css).digest("hex").slice(0, 8);
}
