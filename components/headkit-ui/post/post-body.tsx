import { EditorialContent } from "@/components/headkit-ui/editorial-content";
import { BlockEditor } from "@/components/headkit-ui/block-editor";
import { processHomepageContent } from "@/lib/process-editor-blocks";

interface Props {
  /** Untrusted WordPress post `content` HTML (block-authored). */
  html: string;
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
export async function PostBody({ html }: Props): Promise<React.JSX.Element> {
  if (!html.trim()) {
    return <></>;
  }

  const { segments, blocks } = processHomepageContent(html, []);

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
