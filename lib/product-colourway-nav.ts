/**
 * Helpers for Nike-style PDP colourway path URLs — one colour segment on the
 * product's canonical base path, so `/shop/{cat…}/{slug}/{colour}` on a store
 * whose permalinks are nested and `/products/{slug}/{colour}` otherwise. These
 * helpers never build that base; they take it as `productBasePath`, which the
 * PDP resolves once through `productPath` (`lib/canonical-path.ts`).
 *
 * Colour switches update the path for SEO/shareability, but the full product
 * payload (all colourway galleries + variations) is already on the client —
 * so navigation should be shallow (History API), not a full App Router soft
 * nav that remounts the Suspense/`loading` shell.
 */

/** Colour slug from a product pathname, or `undefined` on the base PDP URL. */
export function colourSlugFromProductPath(
  pathname: string,
  productBasePath: string,
): string | undefined {
  if (pathname === productBasePath) return undefined;
  const prefix = `${productBasePath}/`;
  if (!pathname.startsWith(prefix)) return undefined;
  const segment = pathname.slice(prefix.length).split("/")[0];
  return segment || undefined;
}

type VariationLike = {
  attributes: ReadonlyArray<{ key: string; value: string }>;
};

/**
 * Merge a colourway slug into selected attributes, cascading other attributes
 * from the first matching variation when the prior size/etc. is incompatible.
 */
export function attributesForColourway(
  variations: ReadonlyArray<VariationLike>,
  colorKey: string,
  colourSlug: string,
  prev: Readonly<Record<string, string>>,
): Record<string, string> {
  const withColour = { ...prev, [colorKey]: colourSlug };
  const stillValid = variations.some((v) =>
    v.attributes.every((a) => withColour[a.key] === a.value),
  );
  if (stillValid) return withColour;

  const match = variations.find((v) =>
    v.attributes.some((a) => a.key === colorKey && a.value === colourSlug),
  );
  if (!match) return withColour;

  const cascaded: Record<string, string> = {};
  for (const a of match.attributes) {
    cascaded[a.key] = a.value;
  }
  return cascaded;
}
