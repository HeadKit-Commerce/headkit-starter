import { Fragment } from "react";
import { parseTitleEmphasis } from "@/lib/title-emphasis";
import { decodeHtmlEntities } from "@/lib/utils";

interface Props {
  text: string;
}

/** Render a product title with `{…}` spans italicised (see globals.css). */
export function TitleEmphasis({ text }: Props): React.JSX.Element {
  const parts = parseTitleEmphasis(decodeHtmlEntities(text));
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
