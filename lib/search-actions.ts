"use server";

import type { ProductSummaryFieldsFragment } from "@headkit/sdk";
import { headkit } from "@/lib/sdk";

export async function searchProducts(
  q: string,
  limit = 4,
): Promise<ProductSummaryFieldsFragment[]> {
  if (!q.trim()) return [];
  const result = await headkit.collections.list({ search: q }, 1, limit);
  return result.products as ProductSummaryFieldsFragment[];
}
