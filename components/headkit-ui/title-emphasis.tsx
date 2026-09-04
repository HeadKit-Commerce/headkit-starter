import { Fragment } from "react";
import { parseTitleEmphasis, stripTitleMarkers } from "@/lib/title-emphasis";
import { decodeHtmlEntities } from "@/lib/utils";

interface Props {
  text: string;
  /**
   * `{ }` highlight face is reserved for heading font (H1 / H2).
   * Other surfaces strip the markers and render plain text.
   */
  highlight?: boolean;
}

/** Render `{…}` as the heading highlight face, or strip markers elsewhere. */
export function TitleEmphasis({
  text,
  highlight = false,
}: Props): React.JSX.Element {
  const decoded = decodeHtmlEntities(text);
  if (!highlight) {
    return <>{stripTitleMarkers(decoded)}</>;
  }
  const parts = parseTitleEmphasis(decoded);
  return (
    <>
      {parts.map((part, i) =>
        part.emphasis ? (
          <span key={i} className="headkit-title-emphasis">
            {part.text}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}
