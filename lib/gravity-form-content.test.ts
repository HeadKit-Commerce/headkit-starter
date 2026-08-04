import { describe, expect, it } from "vitest";
import {
  extractGravityFormIds,
  removeGravityFormMarkers,
  hasGravityFormMarker,
} from "./gravity-form-content";

const MARKER = (id: string): string =>
  `<div class="headkit-gravity-form" data-form-id="${id}" data-headkit-gf="1"></div>`;

describe("gravity-form-content markers", () => {
  it("detects a HeadKit GF marker in HTML", () => {
    expect(hasGravityFormMarker(`<p>Hi</p>${MARKER("1")}`)).toBe(true);
    expect(hasGravityFormMarker("<p>No form here</p>")).toBe(false);
  });

  it("extracts form ids in document order", () => {
    const html = `<p>Intro</p>${MARKER("1")}<p>More</p>${MARKER("7")}`;
    expect(extractGravityFormIds(html)).toEqual(["1", "7"]);
  });

  it("ignores markers without a numeric data-form-id", () => {
    const html =
      '<div class="headkit-gravity-form" data-headkit-gf="1"></div>' +
      MARKER("3");
    expect(extractGravityFormIds(html)).toEqual(["3"]);
  });

  it("strips markers so editorial copy can render in the left column", () => {
    const html = `<p>Call us</p>${MARKER("1")}<p>Or email</p>`;
    const stripped = removeGravityFormMarkers(html);
    expect(stripped).not.toContain("headkit-gravity-form");
    expect(stripped).toContain("Call us");
    expect(stripped).toContain("Or email");
  });
});
