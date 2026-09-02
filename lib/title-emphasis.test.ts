import { describe, expect, it } from "vitest";
import { parseTitleEmphasis, stripTitleMarkers } from "./title-emphasis";

describe("stripTitleMarkers", () => {
  it("keeps inner text and drops braces", () => {
    expect(stripTitleMarkers("Monogram {Bath Sheet}")).toBe(
      "Monogram Bath Sheet",
    );
  });

  it("strips multiple markers", () => {
    expect(stripTitleMarkers("{New} Towel {Set}")).toBe("New Towel Set");
  });

  it("leaves plain titles unchanged", () => {
    expect(stripTitleMarkers("Bath Sheet")).toBe("Bath Sheet");
  });

  it("drops leftover unmatched braces", () => {
    expect(stripTitleMarkers("Monogram {Bath Sheet")).toBe("Monogram Bath Sheet");
  });
});

describe("parseTitleEmphasis", () => {
  it("marks balanced spans as emphasis", () => {
    expect(parseTitleEmphasis("Monogram {Bath Sheet}")).toEqual([
      { text: "Monogram ", emphasis: false },
      { text: "Bath Sheet", emphasis: true },
    ]);
  });

  it("leaves unmatched braces as plain text", () => {
    expect(parseTitleEmphasis("Monogram {Bath Sheet")).toEqual([
      { text: "Monogram {Bath Sheet", emphasis: false },
    ]);
  });

  it("skips empty braces", () => {
    expect(parseTitleEmphasis("Towel {} Set")).toEqual([
      { text: "Towel {} Set", emphasis: false },
    ]);
  });

  it("returns a single plain part when there are no markers", () => {
    expect(parseTitleEmphasis("Bath Sheet")).toEqual([
      { text: "Bath Sheet", emphasis: false },
    ]);
  });
});
