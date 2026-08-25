/**
 * JSON-LD reduction.
 *
 * Every node carrying an `@type` is collected, at any depth — including the
 * ones nested inside another node, because `offers.url` and a Breadcrumb's
 * `itemListElement[].item` are exactly the places a URL-shape change lands.
 * Only `@type`, `url` and `@id` are kept: those are the fields a port can
 * regress, and keeping the rest would make every price change look like a
 * structured-data regression.
 */

import type { JsonLdNode } from "./types";

function typeOf(value: unknown): string | null {
  const t = (value as { "@type"?: unknown })["@type"];
  if (typeof t === "string") return t;
  if (Array.isArray(t))
    return t.filter((v) => typeof v === "string").join("+") || null;
  return null;
}

function stringOf(node: Record<string, unknown>, key: string): string | null {
  const v = node[key];
  if (typeof v === "string") return v;
  if (v !== null && typeof v === "object") {
    const inner = (v as Record<string, unknown>)["@id"];
    if (typeof inner === "string") return inner;
  }
  return null;
}

function walk(value: unknown, out: JsonLdNode[]): void {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, out);
    return;
  }
  if (value === null || typeof value !== "object") return;
  const node = value as Record<string, unknown>;
  const type = typeOf(node);
  if (type !== null) {
    out.push({ type, url: stringOf(node, "url"), id: stringOf(node, "@id") });
  }
  for (const key of Object.keys(node)) {
    if (key === "@type") continue;
    walk(node[key], out);
  }
}

/**
 * Parse every `<script type="application/ld+json">` body into flat nodes.
 *
 * A block that does not parse is reported as a node of type
 * `!unparseable-json-ld` rather than dropped: a port that breaks the JSON is a
 * regression, and silently capturing zero nodes would read as "the page never
 * had structured data".
 */
export function extractJsonLd(blocks: readonly string[]): JsonLdNode[] {
  const out: JsonLdNode[] = [];
  for (const block of blocks) {
    const text = block.trim();
    if (text === "") continue;
    try {
      walk(JSON.parse(text) as unknown, out);
    } catch {
      out.push({ type: "!unparseable-json-ld", url: null, id: null });
    }
  }
  return out;
}
