import Image from "next/image";
import sanitize from "sanitize-html";
import { Breadcrumb } from "@/components/ui/breadcrumb";

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
  return (
    <div className="overflow-x-hidden">
      <div className="mb-5 grid grid-cols-1 gap-5 px-4 md:grid-cols-2 md:px-10">
        <div className="pt-5">
          {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
          {thumbnailUrl && (
            <div className="mt-5 mb-3 h-20 w-40 relative">
              <Image
                src={thumbnailUrl}
                alt={name}
                fill
                className="object-contain object-left"
              />
            </div>
          )}
          <h1 className="mb-[10px] mt-5 text-3xl font-bold">{name}</h1>
          {description && (
            <p dangerouslySetInnerHTML={{ __html: sanitize(description) }} />
          )}
        </div>
      </div>
    </div>
  );
}
