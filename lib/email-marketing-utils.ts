/**
 * Pure helpers for detecting marketing opt-in fields in Gravity Forms.
 */

const MARKETING_LABEL =
  /newsletter|mailing\s*list|email\s*me|marketing|subscribe|opt[\s-]?in|keep\s*me\s*(updated|informed)/i;

/** True when a checkbox label looks like a marketing / list opt-in. */
export function isMarketingOptInLabel(
  label: string | null | undefined,
): boolean {
  if (!label) return false;
  return MARKETING_LABEL.test(label);
}

/**
 * Extract the first email-shaped value from a flat form values map.
 * Prefers keys containing "email".
 */
export function extractEmailFromFormValues(
  values: Record<string, string>,
): string | null {
  const entries = Object.entries(values);
  const preferred = entries.find(
    ([key, value]) =>
      /email/i.test(key) && typeof value === "string" && value.includes("@"),
  );
  if (preferred?.[1]) return preferred[1].trim();

  for (const [, value] of entries) {
    if (
      typeof value === "string" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
    ) {
      return value.trim();
    }
  }
  return null;
}

/**
 * True when any marketing-labelled checkbox in `fields` is checked ("true")
 * in `values` (keys are snake_cased labels).
 */
export function hasMarketingOptIn(
  fields: ReadonlyArray<{ type: string; label: string }>,
  values: Record<string, string>,
  snakeCase: (label: string) => string,
): boolean {
  for (const field of fields) {
    if (field.type !== "checkbox") continue;
    if (!isMarketingOptInLabel(field.label)) continue;
    if (values[snakeCase(field.label)] === "true") return true;
  }
  return false;
}
