import sanitize from "sanitize-html";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";

interface PostHeaderProps {
  name: string;
  /** Short plain/HTML blurb when no CMS page content is present. */
  description?: string;
  /** Optional CMS page body (WordPress page content) above the collection. */
  content?: string;
  /**
   * Kept for callers / agent reference — not rendered on the storefront.
   * BreadcrumbList JSON-LD is emitted separately for bots.
   */
  breadcrumbs?: { name: string; uri: string; current: boolean }[];
}

export async function PostHeader({
  name,
  description,
  content,
}: PostHeaderProps): Promise<React.JSX.Element> {
  return (
    <div className="overflow-x-clip">
      <div className="mb-5 grid grid-cols-1 gap-5 px-5 md:grid-cols-2 md:px-10">
        <div className="pt-5">
          <h1 className="mb-[10px] mt-5">{name}</h1>
          {content ? (
            <div className="text-base text-primary [&_.prose]:text-base [&_p]:text-base [&_p]:leading-normal">
              <EditorialContent html={content} />
            </div>
          ) : description ? (
            <p dangerouslySetInnerHTML={{ __html: sanitize(description) }} />
          ) : null}
        </div>
      </div>
    </div>
  );
}
