/**
 * Client-side schedule filter for hero carousel slides.
 *
 * Dates are Y-m-d (or empty). Empty start/end means unbounded on that side.
 * Filtering at render (not in WP/API) keeps the homepage cache stable while
 * still honouring start/end windows as the calendar day rolls over.
 */

export type SchedulableSlide = {
  startDate?: string | null;
  endDate?: string | null;
};

/** Parse Y-m-d to UTC midnight, or null if empty/invalid. */
function parseDay(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** True when `now` falls within [startDate, endDate] (inclusive), empties open. */
export function isSlideActiveOn(
  slide: SchedulableSlide,
  now: Date = new Date(),
): boolean {
  const start = parseDay(slide.startDate);
  const end = parseDay(slide.endDate);
  const t = now.getTime();
  if (start && t < start.getTime()) return false;
  if (end) {
    // Inclusive end of calendar day (UTC).
    const endExclusive = end.getTime() + 24 * 60 * 60 * 1000;
    if (t >= endExclusive) return false;
  }
  return true;
}

/** Filter slides to those active on `now`. */
export function filterActiveSlides<T extends SchedulableSlide>(
  slides: readonly T[],
  now: Date = new Date(),
): T[] {
  return slides.filter((s) => isSlideActiveOn(s, now));
}
