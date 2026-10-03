import {
  applyVisualSwatches,
  attributeIdsNeedingVisuals,
  commerceOriginFromProduct,
  storeApiAttributeTermsUrl,
  visualImageBySlug,
  type SwatchProductLike,
} from "@/lib/swatch-image";

const visualCache = new Map<string, Promise<ReadonlyMap<string, string>>>();

async function loadVisualImages(
  origin: string,
  attributeId: string,
): Promise<ReadonlyMap<string, string>> {
  const images = new Map<string, string>();
  for (let page = 1; page <= 20; page += 1) {
    const response = await fetch(
      storeApiAttributeTermsUrl(origin, attributeId, page),
      { next: { revalidate: 3600 } },
    );
    if (!response.ok) {
      throw new Error(
        `WooCommerce attribute ${attributeId} terms failed (${response.status})`,
      );
    }
    const data: unknown = await response.json();
    if (!Array.isArray(data)) {
      throw new Error(
        `WooCommerce attribute ${attributeId} terms were not a list`,
      );
    }
    for (const [slug, url] of visualImageBySlug(data)) {
      images.set(slug, url);
    }
    if (data.length < 100) break;
  }
  return images;
}

function visualImagesForAttribute(
  origin: string,
  attributeId: string,
): Promise<ReadonlyMap<string, string>> {
  const key = `${origin}|${attributeId}`;
  const cached = visualCache.get(key);
  if (cached) return cached;

  const pending = loadVisualImages(origin, attributeId).catch(() => {
    visualCache.delete(key);
    return new Map<string, string>();
  });
  visualCache.set(key, pending);
  return pending;
}

/**
 * Fill empty `swatchImage` values from the WooCommerce Store API visual terms.
 * One request per visual attribute id, shared across products. Partial stubs
 * with no WordPress image host or no visual attribute are returned unchanged.
 */
export async function enrichProducts<T>(products: readonly T[]): Promise<T[]> {
  const groups = new Map<
    string,
    Array<{ index: number; product: SwatchProductLike & T; ids: string[] }>
  >();

  products.forEach((product, index) => {
    if (!product || typeof product !== "object") return;
    const candidate = product as SwatchProductLike;
    const ids = attributeIdsNeedingVisuals(candidate);
    if (ids.length === 0) return;
    const origin = commerceOriginFromProduct(candidate);
    if (!origin) return;
    const list = groups.get(origin) ?? [];
    list.push({
      index,
      product: product as SwatchProductLike & T,
      ids,
    });
    groups.set(origin, list);
  });

  if (groups.size === 0) return [...products];

  const filled = new Map<number, T>();
  await Promise.all(
    [...groups.entries()].map(async ([origin, lookups]) => {
      const ids = [...new Set(lookups.flatMap((lookup) => lookup.ids))];
      const imagesByAttributeId = new Map<
        string,
        ReadonlyMap<string, string>
      >();
      await Promise.all(
        ids.map(async (id) => {
          imagesByAttributeId.set(
            id,
            await visualImagesForAttribute(origin, id),
          );
        }),
      );
      for (const { index, product } of lookups) {
        filled.set(index, applyVisualSwatches(product, imagesByAttributeId));
      }
    }),
  );

  return products.map((product, index) => filled.get(index) ?? product);
}

export async function enrichProduct<T>(product: T): Promise<T> {
  const enriched = (await enrichProducts([product]))[0] ?? product;
  if (
    enriched == null ||
    typeof enriched !== "object" ||
    !("related" in enriched)
  ) {
    return enriched;
  }
  const related = (enriched as { related?: readonly unknown[] | null }).related;
  if (!related?.length) return enriched;
  return {
    ...enriched,
    related: await enrichProducts(related),
  } as T;
}

export async function enrichCollectionResult<
  T extends { products?: readonly unknown[] | null },
>(result: T): Promise<T> {
  if (!result?.products?.length) return result;
  const products = await enrichProducts(result.products);
  return { ...result, products };
}

/** Fill image swatches on products already attached to CMS editor blocks. */
export async function enrichEditorBlockPage<
  T extends {
    editorBlocks?: ReadonlyArray<{
      products?: readonly unknown[] | null;
    }> | null;
  },
>(page: T): Promise<T> {
  const blocks = page.editorBlocks;
  if (!blocks?.some((block) => block.products?.length)) return page;
  const editorBlocks = await Promise.all(
    blocks.map(async (block) =>
      block.products?.length
        ? { ...block, products: await enrichProducts(block.products) }
        : block,
    ),
  );
  return { ...page, editorBlocks } as T;
}
