/**
 * XSS-safe JSON-LD serialization.
 * Escapes `<` to `\u003c` to prevent script injection via `</script>` sequences
 * when embedding JSON inside a `<script type="application/ld+json">` tag.
 */
export function safeJsonLdStringify(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}
