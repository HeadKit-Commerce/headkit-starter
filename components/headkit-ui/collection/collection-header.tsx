import sanitize from "sanitize-html";
import Image from "next/image";
import Link from "next/link";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import type { ProductCategoryDetail } from "@headkit/sdk";

interface CollectionHeaderProps {
  name: string;
  description?: string;
  breadcrumbs?: { name: string; uri: string; current: boolean }[];
  thumbnail?: string;
  children?: ProductCategoryDetail[];
}

export function CollectionHeader({
  name,
  description,
  breadcrumbs,
  thumbnail,
  children: subcategories,
}: CollectionHeaderProps) {
  return (
    <div className="overflow-x-hidden">
      <div className="mb-5 grid grid-cols-1 gap-5 px-4 md:grid-cols-2 md:px-10">
        <div className="pt-5">
          {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
          <h1 className="mb-[10px] mt-5 text-3xl font-bold">{name}</h1>
          {description && (
            <p
              className="text-gray-800"
              dangerouslySetInnerHTML={{ __html: sanitize(description) }}
            />
          )}
        </div>
        {thumbnail && (
          <div className="flex justify-center md:justify-end md:pt-5">
            <div className="relative h-24 w-full max-w-xs overflow-hidden rounded-lg bg-neutral-100 md:h-32">
              <Image
                alt=""
                src={thumbnail}
                fill
                className="object-cover object-center"
                sizes="(max-width: 768px) 100vw, 33vw"
                priority
              />
            </div>
          </div>
        )}
      </div>
      {subcategories && subcategories.length > 0 && (
        <div className="mt-6 px-4 md:px-10">
          <p className="mb-3 text-sm font-medium text-gray-800">
            Subcategories
          </p>
          <div className="flex flex-wrap gap-2">
            {subcategories.map((child) => {
              const uri = `/collections/${child.slug}`;
              return (
                <Link
                  key={child.id}
                  href={uri}
                  className="inline-flex min-w-0 max-w-full items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:border-purple-300 hover:text-purple-700"
                >
                  {child.thumbnail ? (
                    <span className="relative block h-6 w-6 shrink-0 overflow-hidden rounded">
                      <Image
                        alt=""
                        src={child.thumbnail}
                        fill
                        className="object-cover"
                        sizes="24px"
                      />
                    </span>
                  ) : null}
                  <span className="truncate">{child.name}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
