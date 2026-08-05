import Image from "next/image";

interface FeaturedImageHeaderProps {
  title: string;
  subtitle?: string;
  image?: string | null;
}

/**
 * Full-bleed hero for project (and similar) detail pages.
 * Matches MainCarousel margins (`mx-5`) and branding corner radius
 * (`rounded-brand` / `--radius`) so project heroes align with CMS carousel pages.
 */
export function FeaturedImageHeader({
  title,
  subtitle,
  image,
}: FeaturedImageHeaderProps) {
  return (
    <div className="overflow-hidden mx-5">
      <div className="relative flex min-h-[370px] items-center overflow-hidden rounded-brand md:min-h-[450px]">
        <Image
          src={image || "/assets/images/bg-order-success.png"}
          alt={title}
          fill
          className="z-0 object-cover object-center"
        />
        <div className="absolute left-0 top-0 h-full w-full bg-linear-to-r from-[#0B050F] to-[#FFFFFF00] opacity-75" />
        <div className="relative mx-auto w-full overflow-hidden">
          <div className="relative z-10 grid grid-cols-12 px-[10px] sm:px-[20px]">
            <div className="col-span-10 col-start-2 md:col-span-5">
              <h1 className="text-3xl font-bold leading-10 text-white">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-5 text-xl text-white">{subtitle}</p>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
