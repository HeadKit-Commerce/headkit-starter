/**
 * Minimal Shopify rich-text metafield → HTML. Used when commerce has already
 * converted the metafield, and as a storefront fallback for leftover JSON.
 */

interface RichTextNode {
  type?: string;
  value?: string;
  italic?: boolean;
  bold?: boolean;
  url?: string;
  level?: number;
  listType?: string;
  children?: RichTextNode[];
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderNode(node: RichTextNode): string {
  const children = (node.children ?? []).map(renderNode).join("");
  switch (node.type) {
    case "root":
      return children;
    case "paragraph":
      return `<p>${children}</p>`;
    case "heading": {
      const level = Math.min(Math.max(node.level ?? 2, 1), 6);
      return `<h${level}>${children}</h${level}>`;
    }
    case "list":
      return node.listType === "ordered"
        ? `<ol>${children}</ol>`
        : `<ul>${children}</ul>`;
    case "list-item":
      return `<li>${children}</li>`;
    case "link":
      return `<a href="${escapeHtml(node.url ?? "")}">${children}</a>`;
    case "text": {
      let text = escapeHtml(node.value ?? "");
      if (node.bold) text = `<strong>${text}</strong>`;
      if (node.italic) text = `<em>${text}</em>`;
      return text;
    }
    default:
      return children || escapeHtml(node.value ?? "");
  }
}

/** Convert a Shopify `rich_text_field` JSON string to HTML, or return as-is. */
export function shopifyRichTextToHtml(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return raw;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("type" in parsed) ||
      (parsed as RichTextNode).type !== "root"
    ) {
      return raw;
    }
    return renderNode(parsed as RichTextNode);
  } catch {
    return raw;
  }
}
