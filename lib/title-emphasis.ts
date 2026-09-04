/**
 * Merchant title markers: `{Bath Sheet}` uses the heading highlight face
 * on H1 / H2 only. Braces are display-only — strip them from every other
 * surface, plus SEO, JSON-LD, alts, and cart/checkout names.
 */

export interface TitlePart {
  text: string;
  emphasis: boolean;
}

const EMPHASIS_RE = /\{([^{}]+)\}/g;

/** Remove `{` / `}` markers, keeping the inner text. */
export function stripTitleMarkers(value: string): string {
  return value.replace(EMPHASIS_RE, "$1").replace(/[{}]/g, "");
}

/**
 * Split a title into plain and emphasised runs. Unmatched `{` / `}` stay
 * as literal text. Empty `{}` is not a match (requires one or more chars).
 */
export function parseTitleEmphasis(value: string): TitlePart[] {
  const parts: TitlePart[] = [];
  let last = 0;
  const re = new RegExp(EMPHASIS_RE.source, "g");
  let match = re.exec(value);
  while (match !== null) {
    if (match.index > last) {
      parts.push({ text: value.slice(last, match.index), emphasis: false });
    }
    const inner = match[1];
    if (inner !== undefined) {
      parts.push({ text: inner, emphasis: true });
    }
    last = match.index + match[0].length;
    match = re.exec(value);
  }
  if (last < value.length) {
    parts.push({ text: value.slice(last), emphasis: false });
  }
  if (parts.length === 0) {
    return [{ text: value, emphasis: false }];
  }
  return parts;
}
