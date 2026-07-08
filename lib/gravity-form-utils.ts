/**
 * Pure helpers for the Gravity Forms component. Kept framework-free so the
 * field-id resolution — the part that regressed in ENG-794 — is unit-testable
 * without rendering the client component.
 */

/** Convert a label like "First Name" to "first_name" for form field keys. */
export function snakeCase(str: string): string {
  return str
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

/** Minimal shape of a Gravity Forms field node needed for id resolution. */
export interface GravityFieldNode {
  databaseId: number;
  label?: string | null;
}

/** A single field value submitted to Gravity Forms. */
export interface GravityFieldValue {
  id?: number;
  value: string;
}

/**
 * Build a map from a field's snakeCased label to its Gravity Forms databaseId,
 * across ALL fields — including hidden ones that never render. Injected/hidden
 * values (e.g. product-enquiry context) must submit WITH their numeric id or the
 * commerce provider drops them and the entry loses the data (ENG-794).
 */
export function buildFieldIdByName(
  nodes: ReadonlyArray<GravityFieldNode | null | undefined> | null | undefined,
): Record<string, number> {
  const map: Record<string, number> = {};
  for (const node of nodes ?? []) {
    if (node?.label && node.databaseId != null) {
      map[snakeCase(node.label)] = node.databaseId;
    }
  }
  return map;
}

/**
 * Map a `{ fieldKey: value }` record to Gravity Forms field values, attaching
 * each value's numeric databaseId when the field is known. Unknown keys are
 * still sent (without an id) so behaviour matches the pre-existing contract.
 */
export function buildFieldValues(
  values: Record<string, string>,
  fieldIdByName: Record<string, number>,
): GravityFieldValue[] {
  return Object.entries(values).map(([key, value]) => {
    const databaseId = fieldIdByName[key];
    const stringValue = value?.toString() ?? "";
    return databaseId !== undefined
      ? { id: databaseId, value: stringValue }
      : { value: stringValue };
  });
}
