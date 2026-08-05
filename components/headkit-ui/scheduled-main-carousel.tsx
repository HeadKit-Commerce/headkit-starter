import { Suspense } from "react";
import { connection } from "next/server";
import type { HeroCarouselItem } from "@headkit/sdk";
import { MainCarousel } from "@/components/headkit-ui/main-carousel";
import {
  filterActiveSlides,
  type SchedulableSlide,
} from "@/lib/carousel-schedule";

type HeroSlide = HeroCarouselItem & SchedulableSlide;

interface Props {
  carouselItems: HeroCarouselItem[];
}

/**
 * Applies the slide schedule at REQUEST time, then renders the carousel.
 *
 * The schedule cannot be evaluated anywhere cached. `filterActiveSlides`
 * defaults `now` to `new Date()`, and the homepage that hosts this carousel is
 * `'use cache'` with `cacheLife('days')` — so evaluating it inside that tree
 * would freeze "now" into the cache entry and a slide scheduled to start
 * tomorrow would appear up to a day late. Evaluating it in the client
 * component's render is what Next 16 rejects outright:
 *
 *   Route "/": Next.js encountered the unstable value `new Date()` in a
 *   Client Component.
 *
 * `connection()` marks this subtree as request-time, which is what makes the
 * date read legitimate rather than a prerender hazard.
 */
async function ScheduledSlides({ carouselItems }: Props) {
  await connection();

  const items = filterActiveSlides(carouselItems as HeroSlide[]);
  if (items.length === 0) return null;

  return <MainCarousel carouselItems={items} />;
}

/**
 * The Suspense boundary sits HERE — directly around the dynamic read — rather
 * than at the route root. A root-altitude boundary under Cache Components
 * empties the entire static shell and relocates the page into JS-driven divs,
 * which is why `app/page.tsx` deliberately renders `HomeContent` without one.
 * Keeping the boundary this low means only the hero streams; the rest of the
 * homepage stays in the prerendered shell.
 */
export function ScheduledMainCarousel({ carouselItems }: Props) {
  if (carouselItems.length === 0) return null;

  return (
    <Suspense fallback={null}>
      <ScheduledSlides carouselItems={carouselItems} />
    </Suspense>
  );
}
