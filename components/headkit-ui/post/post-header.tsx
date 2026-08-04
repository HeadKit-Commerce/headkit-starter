import sanitize from "sanitize-html";
import { Breadcrumb } from "@/components/ui/breadcrumb";

interface PostHeaderProps {
  name: string;
  description?: string;
  breadcrumbs?: { name: string; uri: string; current: boolean }[];
}

export function PostHeader({
  name,
  description,
  breadcrumbs,
}: PostHeaderProps) {
  return (
    <div className="overflow-x-clip">
      <div className="mb-5 grid grid-cols-1 gap-5 px-4 md:grid-cols-2 md:px-10">
        <div className="pt-5">
          {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
          <h1 className="mb-[10px] mt-5 text-3xl font-bold">{name}</h1>
          {description && (
            <p dangerouslySetInnerHTML={{ __html: sanitize(description) }} />
          )}
        </div>
      </div>
    </div>
  );
}
