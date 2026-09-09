import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import { BlockEditor } from "@/components/headkit-ui/block-editor";
import {
  processHomepageContent,
  type RawEditorBlock,
} from "@/lib/process-editor-blocks";

interface Props {
  /** Untrusted WordPress post `content` HTML (block-authored). */
  html: string;
  /**
   * Hydrated HeadKit section blocks from the post's `GetContent` payload
   * (`editorBlocks[].products`, `ProductSummaryFields`). The theme hydrates
   * posts exactly as it hydrates pages, so a product carousel's products
   * arrive here already resolved — passing them is what keeps
   * `HeadKitProductCarouselSection` off its HTML-scan fallback, which costs
   * one product read per product on every request (a 24-product sale post
   * measured 14 s → 1.0 s once the blocks were threaded through). Omit or
   * pass `[]` only for content whose blocks are not hydrated; the fallback
   * still resolves those.
   */
  editorBlocks?: RawEditorBlock[] | null | undefined;
}

/** Padding for prose HTML segments — matches news detail wrapper. */
const HTML_PAD = "my-[40px] px-[20px] md:px-[40px]";

/**
 * Post body with the same HeadKit section hydration as CMS pages.
 *
 * Posts previously rendered only through {@link EditorialContent}, so patterns
 * like `headkit-callout` stayed as raw `wp-block-group` markup and lost the
 * storefront Callout chrome (border, pad, button row). Section groups are
 * extracted and passed through {@link BlockEditor}; leftover Gutenberg HTML
 * keeps the editorial sanitize + block CSS path.
 */
export async function PostBody({
  html,
  editorBlocks,
}: Props): Promise<React.JSX.Element> {
  if (!html.trim()) {
    return <></>;
  }

  const { segments, blocks } = processHomepageContent(html, editorBlocks ?? []);

  if (blocks.length === 0) {
    return (
      <div className={HTML_PAD}>
        <EditorialContent html={html} />
      </div>
    );
  }

  return (
    <>
      {segments.map((seg, index) => {
        if (seg.kind === "block") {
          return (
            <BlockEditor key={`post-block-${index}`} blocks={[seg.block]} />
          );
        }
        if (!seg.html.trim()) return null;
        return (
          <div key={`post-html-${index}`} className={HTML_PAD}>
            <EditorialContent html={seg.html} />
          </div>
        );
      })}
    </>
  );
}
