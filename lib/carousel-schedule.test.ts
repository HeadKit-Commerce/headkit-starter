import { describe, expect, it } from "vitest";
import { filterActiveSlides, isSlideActiveOn } from "./carousel-schedule";

describe("carousel-schedule", () => {
  const noon = new Date("2026-08-04T12:00:00.000Z");

  it("treats empty dates as always active", () => {
    expect(isSlideActiveOn({}, noon)).toBe(true);
    expect(isSlideActiveOn({ startDate: "", endDate: "" }, noon)).toBe(true);
  });

  it("hides slides before startDate", () => {
    expect(isSlideActiveOn({ startDate: "2026-08-10" }, noon)).toBe(false);
  });

  it("shows slides on startDate and after", () => {
    expect(isSlideActiveOn({ startDate: "2026-08-04" }, noon)).toBe(true);
  });

  it("hides slides after endDate (inclusive calendar day)", () => {
    expect(isSlideActiveOn({ endDate: "2026-08-03" }, noon)).toBe(false);
    expect(isSlideActiveOn({ endDate: "2026-08-04" }, noon)).toBe(true);
  });

  it("filters a list to active slides only", () => {
    const slides = [
      { id: "a", startDate: "2026-08-01", endDate: "2026-08-03" },
      { id: "b", startDate: "2026-08-04", endDate: "" },
      { id: "c", startDate: "2026-08-10" },
    ];
    expect(filterActiveSlides(slides, noon).map((s) => s.id)).toEqual(["b"]);
  });
});
