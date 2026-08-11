import { describe, expect, it } from "vitest";
import {
  extractGravityFormIds,
  removeGravityFormMarkers,
  hasGravityFormMarker,
  withGuaranteedFormMarker,
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

describe("withGuaranteedFormMarker", () => {
  // The regression this exists for.
  //
  // Dishee's WordPress Contact page is `<p>Dishee Australia</p>` — real copy,
  // no `[gravityform]` shortcode, because under V1 the form was placed by CODE
  // (`<GravityForm formId="1" />` in the old storefront's /contact route), not
  // by page content. V2 moved placement into the page, and the page was never
  // given one.
  //
  // The route read `page?.content ?? <default with marker>`, so the default
  // only applied when the page was ABSENT. A page that exists but carries no
  // form silently produced a contact page with no contact form — answering 200
  // with copy, which is why a status sweep could not see it.
  it("appends the default marker when the page has copy but no form", () => {
    const html = withGuaranteedFormMarker("<p>Dishee Australia</p>", "1");
    expect(html).toContain("Dishee Australia");
    expect(hasGravityFormMarker(html)).toBe(true);
    expect(extractGravityFormIds(html)).toEqual(["1"]);
  });

  // An editor who placed a form has made a decision; nothing may override it.
  it("leaves a page that already places a form untouched", () => {
    const html = `<p>Reach us</p>${MARKER("7")}`;
    expect(withGuaranteedFormMarker(html, "1")).toBe(html);
    expect(extractGravityFormIds(withGuaranteedFormMarker(html, "1"))).toEqual([
      "7",
    ]);
  });

  it("does not add a second form when several are already placed", () => {
    const html = `${MARKER("2")}<p>or</p>${MARKER("3")}`;
    expect(extractGravityFormIds(withGuaranteedFormMarker(html, "1"))).toEqual([
      "2",
      "3",
    ]);
  });

  // A missing page is the case the old `??` already handled; keep it working.
  it("still produces a form when there is no page at all", () => {
    for (const empty of [null, undefined, "", "   "]) {
      const html = withGuaranteedFormMarker(empty, "1");
      expect(extractGravityFormIds(html)).toEqual(["1"]);
    }
  });

  // The marker this emits must be readable by the same parser that reads the
  // theme's, or the guarantee is only apparent.
  it("emits a marker the extractor round-trips", () => {
    const html = withGuaranteedFormMarker("<p>hi</p>", "42");
    expect(removeGravityFormMarkers(html)).toBe("<p>hi</p>");
  });
});
