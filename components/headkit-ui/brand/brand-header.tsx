import Image from "next/image";
import sanitize from "sanitize-html";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { decodeHtmlEntities } from "@/lib/utils";

interface BrandHeaderProps {
  name: string;
  description?: string | null | undefined;
  thumbnailUrl?: string | null | undefined;
  breadcrumbs?: { name: string; uri: string; current: boolean }[] | undefined;
}

export function BrandHeader({
  name,
  description,
  thumbnailUrl,
  breadcrumbs,
}: BrandHeaderProps) {
  const decodedName = decodeHtmlEntities(name);
  const decodedBreadcrumbs = breadcrumbs?.map((b) => ({
    ...b,
    name: decodeHtmlEntities(b.name),
  }));
  return (
    <div className="overflow-x-clip">
      <div className="mb-5 grid grid-cols-1 gap-5 px-4 md:grid-cols-2 md:px-10">
        <div className="pt-5">
          {decodedBreadcrumbs && <Breadcrumb items={decodedBreadcrumbs} />}
          {thumbnailUrl && (
            <div className="mt-5 mb-3 h-20 w-40 relative">
              <Image
                src={thumbnailUrl}
                alt={decodedName}
                fill
                quality={65}
                sizes="160px"
                className="object-contain object-left"
              />
            </div>
          )}
          <h1 className="mb-[10px] mt-5 text-3xl font-bold">{decodedName}</h1>
          {description && (
            <p dangerouslySetInnerHTML={{ __html: sanitize(description) }} />
          )}
        </div>
      </div>
    </div>
  );
}
