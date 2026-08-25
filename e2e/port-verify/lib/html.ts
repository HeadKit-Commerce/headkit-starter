/**
 * Signal extraction from a raw HTML response body.
 *
 * WHY THIS READS THE RAW BYTES AND NOT THE LIVE DOM. The no-JavaScript pass has
 * to describe what a client that runs no script actually receives, and a DOM
 * read requires script to run. So the no-JS metrics come from here — the
 * prerendered shell exactly as it left the server — while the JS-on signals are
 * read from the live DOM. The two are captured separately and reported
 * separately, because a shell that carries content only inside JS-relocated
 * hidden divs must not read as a shell that carries content.
 *
 * These are extractors, not a parser. They are used for metrics and for the
 * no-JS pass; the authoritative JS-on extraction happens in the browser.
 */

const VOID_CONTENT =
  /<(script|style|template|svg|noscript)\b[^>]*>[\s\S]*?<\/\1>/gi;

/** Strip tags and non-rendering content, returning collapsed visible text. */
export function htmlToText(html: string): string {
  return html
    .replace(VOID_CONTENT, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/\s+/g, " ")
    .trim();
}

/** Every `href` value on an `<a>` element, in document order. */
export function extractAnchorHrefs(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(
    /<a\b[^>]*?\shref\s*=\s*("([^"]*)"|'([^']*)')/gi,
  )) {
    out.push(m[2] ?? m[3] ?? "");
  }
  return out;
}

/** Whether the shell carries a `<noscript>` block with any content. */
export function hasNoscriptContent(html: string): boolean {
  for (const m of html.matchAll(/<noscript\b[^>]*>([\s\S]*?)<\/noscript>/gi)) {
    if ((m[1] ?? "").trim() !== "") return true;
  }
  return false;
}

/**
 * One attribute of one already-matched tag.
 *
 * MATCH THE TAG FIRST, THEN ITS ATTRIBUTES. An earlier version fused the two
 * into one expression, which silently required `rel` to appear before `href`
 * and `name` before `content`. HTML attribute order is not semantic, so a page
 * serving `<link href="…" rel="canonical">` produced no match at all — and on a
 * signals-only entry there is no live-DOM fallback, so the canonical would have
 * recorded as absent in BOTH runs and diffed to nothing. That is a silent blind
 * spot on exactly the flat product URLs whose canonical is the signal under
 * test.
 *
 * The name must be preceded by whitespace so `data-rel=` cannot answer for
 * `rel=`. Unquoted values are accepted because HTML permits them.
 */
function attrOf(tag: string, name: string): string | null {
  const m = new RegExp(
    `\\s${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'\`=<>]+))`,
    "i",
  ).exec(tag);
  if (m === null) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

/** Every `<link rel="canonical">` href, in document order, attribute order irrelevant. */
export function extractCanonicals(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = m[0];
    if (attrOf(tag, "rel")?.trim().toLowerCase() !== "canonical") continue;
    const href = attrOf(tag, "href");
    if (href !== null) out.push(href);
  }
  return out;
}

/** Every `<meta name="robots">` content, in document order, attribute order irrelevant. */
export function extractRobotsMetas(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (attrOf(tag, "name")?.trim().toLowerCase() !== "robots") continue;
    const content = attrOf(tag, "content");
    if (content !== null) out.push(content);
  }
  return out;
}

/**
 * Collapse a page's copies of one tag into one order-independent value.
 *
 * A page is supposed to carry ONE canonical and ONE robots meta, and reading
 * "the first one" is what a naive extractor does. Measured against a real
 * rehearsal storefront, that is not safe: its not-found page emits two robots
 * metas — `noindex` and `noindex, nofollow` — and their document order FLIPS
 * between two responses served from the same cache entry. Recording the first
 * made the capture non-reproducible for a reason that had nothing to do with
 * any port. Sorting and joining makes the record stable AND makes the duplicate
 * visible, which is the actual finding.
 */
export function joinTagValues(values: readonly string[]): string | null {
  if (values.length === 0) return null;
  const unique = [...new Set(values)].sort();
  return unique.length === 1 ? unique[0]! : unique.join(" | ");
}
