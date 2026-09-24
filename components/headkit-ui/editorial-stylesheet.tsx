import {
  EDITORIAL_STYLESHEET_HREF,
  EDITORIAL_STYLESHEET_PRECEDENCE,
} from "@/lib/editorial-stylesheet";

/**
 * Pulls the WordPress block stylesheet onto whichever route rendered this,
 * and no other. `lib/editorial-stylesheet.ts` carries why it is a `<link>`
 * and not an `import`.
 *
 * `precedence` is what makes React hoist it into `<head>` and treat it as
 * render-blocking — the same standing the imported stylesheet had — and what
 * makes a second render of it a no-op. The bucket name is deliberately NOT
 * `next`: these rules must stay AFTER the app's own stylesheets, which is the
 * order the imported build emitted them in.
 */
export function EditorialStylesheet(): React.JSX.Element {
  return (
    <link
      rel="stylesheet"
      href={EDITORIAL_STYLESHEET_HREF}
      precedence={EDITORIAL_STYLESHEET_PRECEDENCE}
    />
  );
}
