import sanitize from "sanitize-html";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EditorialContent } from "@/components/headkit-ui/editorial-content";

interface PostHeaderProps {
  name: string;
  /** Short plain/HTML blurb when no CMS page content is present. */
  description?: string;
  /** Optional CMS page body (WordPress page content) above the collection. */
  content?: string;
  breadcrumbs?: { name: string; uri: string; current: boolean }[];
}

export async function PostHeader({
  name,
  description,
  content,
  breadcrumbs,
}: PostHeaderProps): Promise<React.JSX.Element> {
  return (
    <div className="overflow-x-clip">
      <div className="mb-5 grid grid-cols-1 gap-5 px-4 md:grid-cols-2 md:px-10">
        <div className="pt-5">
          {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
          <h1 className="mb-[10px] mt-5 text-3xl font-bold">{name}</h1>
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
