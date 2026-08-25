/**
 * Normalisation of captured strings before comparison.
 *
 * Two kinds live here and they are not the same thing:
 *
 *  - ORIGIN NORMALISATION is unconditional and lossless. Absolute URLs in a
 *    canonical, an `og:url` or a JSON-LD node carry the host, so a capture pair
 *    taken on two different hosts would otherwise differ on every single row
 *    for a reason nobody cares about. The target's own origin becomes the
 *    literal token `{origin}`; a THIRD-PARTY origin is left alone, because a
 *    canonical that starts naming another host is precisely the regression this
 *    harness exists to catch.
 *
 *    CAPTURE TIME IS NOT ENOUGH ON ITS OWN. A capture rewrites only the origin
 *    it was pointed at, and this storefront does not build its absolute URLs
 *    from the request host: `storefrontUrl(path, storeSettings.domain)` and
 *    `resolveJsonLdSiteUrl()` bake the RUNTIME STORE DOMAIN into the canonical,
 *    `og:url` and every JSON-LD `url`/`@id`. Sweep a preview host and that
 *    baked origin is not the run's own, so it survives capture-time
 *    normalisation verbatim while the production run's copy became `{origin}` —
 *    a row on every full-mode URL that says nothing about the storefront. So
 *    the comparison normalises against BOTH runs' origins as well; see
 *    {@link normalizeOrigins}.
 *
 *  - RULE NORMALISATION is declared per plan, and every rule is a blind spot.
 *    Each one carries a `why` that is rendered into the report, so the reader
 *    of a green run can see what the run agreed not to look at.
 */

import type { NormalizeField, NormalizeRule } from "./types";

/**
 * The literal token every recognised origin is rewritten to.
 *
 * Exported because its PRESENCE is load-bearing at comparison time: once two
 * runs swept different hosts, a value carrying this token no longer names the
 * same real origin in both, and `diff.ts` reports such a field as undetermined
 * rather than as a match.
 */
export const ORIGIN_TOKEN = "{origin}";

function trimOrigin(origin: string): string {
  return origin.replace(/\/+$/, "");
}

/** Replace the target's own origin with `{origin}`; leave other hosts intact. */
export function normalizeOrigin(value: string, origin: string): string {
  if (origin === "") return value;
  return value.split(trimOrigin(origin)).join(ORIGIN_TOKEN);
}

/**
 * Replace ANY of the given origins with `{origin}`; leave other hosts intact.
 *
 * Used at comparison time with both runs' base URLs, so a value carrying the
 * OTHER run's origin — which capture-time normalisation could not have seen —
 * lines up with its counterpart. Idempotent: a value already rewritten to
 * `{origin}` contains none of them and passes through untouched.
 *
 * Still leaves a third-party origin alone. That is the whole point of doing
 * this by origin list rather than by stripping every scheme+host: a canonical
 * that starts naming somebody else's domain is the regression being hunted, and
 * it has to survive into the report as a difference.
 *
 * LONGEST ORIGIN FIRST, because substitution is by literal split and an origin
 * that is a PREFIX of the other would otherwise eat it: on a
 * `https://dishee.com` -> `https://dishee.com.au` cutover — the TLD move that is
 * the clearest legitimate use of a cross-origin pair — a baked
 * `https://dishee.com.au/shop/x` split on the shorter origin becomes
 * `{origin}.au/shop/x`, the second pass finds nothing left to match, and every
 * full-mode URL reports a canonical/og/JSON-LD row that describes nothing.
 */
export function normalizeOrigins(
  value: string,
  origins: readonly string[],
): string {
  const longestFirst = [...origins].sort(
    (a, b) => trimOrigin(b).length - trimOrigin(a).length,
  );
  let out = value;
  for (const origin of longestFirst) out = normalizeOrigin(out, origin);
  return out;
}

/**
 * Reduce a normalised href that begins with `{origin}` back to a bare path.
 *
 * {@link normalizeHref} reduces a SAME-ORIGIN href to a site-relative path and
 * keeps any other one absolute, and "same origin" is decided against the run's
 * own `--base-url`. So an absolute internal href baked from the store domain is
 * recorded as `/shop` by the run that swept that domain and as
 * `https://store.example/shop` by the other — which compare-time origin
 * normalisation turns into `{origin}/shop`, still not equal to `/shop`, so the
 * pair emitted an `href removed` + `href added` row per URL while the report
 * claimed rendered hrefs were among the fields it reconciled.
 *
 * Reducing does not hide the origin: `diff.ts` tests for the token BEFORE
 * reducing, and a match that needed this reduction is reported as undetermined.
 */
export function reduceOriginHref(href: string): string {
  if (!href.startsWith(ORIGIN_TOKEN)) return href;
  const rest = href.slice(ORIGIN_TOKEN.length);
  return rest === "" ? "/" : rest;
}

/** Apply every rule whose field matches (or is `all`) to one string. */
export function applyRules(
  field: NormalizeField,
  value: string,
  rules: readonly NormalizeRule[],
): string {
  let out = value;
  for (const rule of rules) {
    if (rule.field !== field && rule.field !== "all") continue;
    out = out.replace(new RegExp(rule.pattern, rule.flags), rule.replace);
  }
  return out;
}

/** Origin normalisation followed by rule normalisation. */
export function normalizeValue(
  field: NormalizeField,
  value: string,
  origin: string,
  rules: readonly NormalizeRule[],
): string {
  return applyRules(field, normalizeOrigin(value, origin), rules);
}

/**
 * Reduce an href to the comparable form: same-origin and relative hrefs become
 * site-relative paths, off-site hrefs keep their origin, and fragments and
 * mailto/tel links are preserved verbatim so their disappearance is visible.
 */
export function normalizeHref(
  href: string,
  origin: string,
  pageUrl: string,
  rules: readonly NormalizeRule[],
): string | null {
  const raw = href.trim();
  if (raw === "") return null;
  if (/^(mailto:|tel:|javascript:|data:)/i.test(raw)) return raw;
  let resolved: URL;
  try {
    resolved = new URL(raw, pageUrl);
  } catch {
    return applyRules("links", raw, rules);
  }
  const sameOrigin =
    origin !== "" && resolved.origin === new URL(origin).origin;
  const value = sameOrigin
    ? `${resolved.pathname}${resolved.search}${resolved.hash}`
    : resolved.toString();
  return applyRules("links", value, rules);
}
