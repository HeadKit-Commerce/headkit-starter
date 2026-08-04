import Image from "next/image";
import Link from "next/link";
import { decodeHtmlEntities } from "@/lib/utils";

interface Props {
  title: string;
  image: string;
  uri: string;
}

const PostCard = ({ title, image, uri }: Props) => {
  const decodedTitle = decodeHtmlEntities(title);
  return (
    <Link href={`/news/${uri}`} className="block group">
      <div className="relative aspect-video w-full overflow-hidden rounded-brand bg-gray-100">
        {image && (
          <Image
            src={image}
            alt={decodedTitle}
            fill
            className="object-cover transition-transform duration-300 group-hover:scale-105"
            sizes="(max-width: 640px) 91vw, (max-width: 1024px) 50vw, 33vw"
          />
        )}
      </div>
      <h3 className="mt-3 text-[17px] font-semibold leading-snug text-primary group-hover:underline">
        {decodedTitle}
      </h3>
    </Link>
  );
};

export { PostCard };
