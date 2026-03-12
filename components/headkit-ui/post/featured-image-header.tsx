import Image from "next/image";

interface FeaturedImageHeaderProps {
  title: string;
  subtitle?: string;
  image?: string | null;
}

export function FeaturedImageHeader({
  title,
  subtitle,
  image,
}: FeaturedImageHeaderProps) {
  return (
    <div className="px-[10px] sm:px-[20px]">
      <div className="relative flex min-h-[370px] items-center md:min-h-[450px] rounded-[20px] overflow-hidden">
        <Image
          src={image || "/assets/images/bg-order-success.png"}
          alt={title}
          fill
          className="z-0 object-cover object-center"
        />
        <div className="absolute left-0 top-0 h-full w-full bg-linear-to-r from-[#0B050F] to-[#FFFFFF00] opacity-75" />
        <div className="relative mx-auto overflow-hidden w-full">
          <div className="relative z-10 grid grid-cols-12 px-[10px] sm:px-[20px]">
            <div className="col-start-2 col-span-10 md:col-span-5">
              <h1 className="text-3xl font-bold leading-10 text-white">
                {title}
              </h1>
              {subtitle && (
                <p className="text-xl mt-5 text-white">{subtitle}</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
