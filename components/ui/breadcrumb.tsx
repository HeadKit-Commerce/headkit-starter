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
    <div className="flex items-center gap-1 text-sm">
      {items.map((item, i) => {
        if (item.current) {
          return (
            <div key={i} className="text-purple-800">
              {item.name}
            </div>
          );
        } else {
          return (
            <Fragment key={i}>
              <Link
                href={convertToRelativePath(item?.uri) || ""}
                className="text-gray-800 hover:underline"
              >
                {item.name}
              </Link>
              <div className="text-gray-800">{">"}</div>
            </Fragment>
          );
        }
      })}
    </div>
  );
};

export { Breadcrumb };
