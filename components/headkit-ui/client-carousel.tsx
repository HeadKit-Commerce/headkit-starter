"use client";

import Image from "next/image";
import { Carousel } from "@/components/headkit-ui/carousel";
import { InstantLink } from "@/components/headkit-ui/instant-link";
import { decodeHtmlEntities } from "@/lib/utils";

export type ClientCarouselItem = {
  name: string;
  slug: string;
  thumbnail: string;
  projectCount?: number;
  singleProjectSlug?: string | null;
  uri?: string | null;
};

interface Props {
  clients: ClientCarouselItem[];
}

/** Logo strip: only clients with a real logo. */
function clientsWithLogos(clients: Props["clients"]): Props["clients"] {
  return clients.filter(
    (c) => typeof c?.thumbnail === "string" && c.thumbnail.trim() !== "",
  );
}

function clientHref(client: ClientCarouselItem): string | null {
  const count = client.projectCount ?? 0;
  if (count <= 0) return null;
  if (count === 1 && client.singleProjectSlug) {
    return `/projects/${client.singleProjectSlug}`;
  }
  return client.uri?.trim() || `/client/${client.slug}`;
}

function clientLinkLabel(client: ClientCarouselItem): string | null {
  const count = client.projectCount ?? 0;
  if (count <= 0) return null;
  if (count === 1) return "View Project";
  return "View Projects";
}

const ClientCarousel = ({ clients }: Props) => {
  const logos = clientsWithLogos(clients);
  if (logos.length === 0) {
    return null;
  }

  return (
    <Carousel
      items={logos}
      gap="gap-[100px]"
      padding="px-5 md:px-10"
      centerWhenFits
      itemSizing={{
        base: "w-[160px]",
        sm: "sm:w-[160px]",
        lg: "lg:w-[160px]",
      }}
      showControls={false}
      showScrollbar={false}
      renderItem={(item) => {
        const href = clientHref(item);
        const linkLabel = clientLinkLabel(item);
        const src = item.thumbnail.trim();
        const name = decodeHtmlEntities(item?.name ?? "");

        const logo = (
          <span className="relative flex h-[50px] w-[160px] items-center justify-center">
            <Image
              alt={name}
              src={src}
              fill
              quality={65}
              sizes="160px"
              className="object-contain object-center"
            />
          </span>
        );

        return (
          <div className="flex w-[160px] flex-col items-center gap-2">
            {href ? (
              <InstantLink href={href} aria-label={name}>
                {logo}
              </InstantLink>
            ) : (
              logo
            )}
            {href && linkLabel ? (
              <InstantLink
                href={href}
                className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
              >
                {linkLabel}
              </InstantLink>
            ) : null}
          </div>
        );
      }}
      className="w-full"
      autoplay={{
        enabled: true,
        delay: 3000,
        stopOnInteraction: true,
      }}
      loop={true}
      showPagination={false}
    />
  );
};

export { ClientCarousel };
