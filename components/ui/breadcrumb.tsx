import Link from "next/link";
import { Fragment } from "react";
import { convertToRelativePath } from "@/lib/convert-uri";

interface Props {
  items: {
    name: string;
    uri: string;
    current: boolean;
  }[];
}
const Breadcrumb = ({ items }: Props) => {
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-1 text-sm break-words">
        {items.map((item, i) => {
          if (item.current) {
            return (
              <li key={i} className="max-w-full text-primary">
                {item.name}
              </li>
            );
          } else {
            return (
              <Fragment key={i}>
                <li className="max-w-full shrink">
                  <Link
                    href={convertToRelativePath(item?.uri) || ""}
                    className="cursor-pointer text-gray-800 hover:underline"
                  >
                    {item.name}
                  </Link>
                </li>
                <li className="text-gray-800" aria-hidden="true">
                  {">"}
                </li>
              </Fragment>
            );
          }
        })}
      </ol>
    </nav>
  );
};

export { Breadcrumb };
