import { describe, expect, it } from "vitest";
import {
  extractAnchorHrefs,
  extractCanonicals,
  extractRobotsMetas,
  hasNoscriptContent,
  htmlToText,
  joinTagValues,
} from "./html";

const SHELL = `<!doctype html><html><head>
<link rel="canonical" href="https://s.invalid/shop/a"><meta name="robots" content="noindex, nofollow">
<style>body{color:red}</style><script>var x = "not text";</script>
</head><body><h1>Hello</h1><noscript><p>Enable scripting</p></noscript>
<a href="/one">One</a><a href='/two'>Two</a></body></html>`;

describe("raw-HTML extraction", () => {
  it("reads the shell's canonical and robots meta", () => {
    expect(extractCanonicals(SHELL)).toEqual(["https://s.invalid/shop/a"]);
    expect(extractRobotsMetas(SHELL)).toEqual(["noindex, nofollow"]);
  });

  it("collapses duplicate tags order-independently", () => {
    // Measured on a real rehearsal storefront: its not-found page emits two
    // robots metas whose document order flips between responses served from
    // the same cache entry. Reading "the first one" made the capture
    // non-reproducible for a reason unrelated to any port.
    expect(joinTagValues(["noindex", "noindex, nofollow"])).toBe(
      "noindex | noindex, nofollow",
    );
    expect(joinTagValues(["noindex, nofollow", "noindex"])).toBe(
      "noindex | noindex, nofollow",
    );
    expect(joinTagValues(["noindex", "noindex"])).toBe("noindex");
    expect(joinTagValues([])).toBeNull();
  });

  it("reads a canonical and a robots meta whose attributes are in either order", () => {
    // HTML attribute order is not semantic. An extractor that required `rel`
    // before `href` recorded the canonical as absent in BOTH runs, which diffs
    // to nothing — a silent blind spot on exactly the flat product URLs whose
    // canonical is the signal under test.
    const reversed = `<link href="https://s.invalid/shop/b" rel="canonical">
<meta content="noindex" name="robots">`;
    expect(extractCanonicals(reversed)).toEqual(["https://s.invalid/shop/b"]);
    expect(extractRobotsMetas(reversed)).toEqual(["noindex"]);
  });

  it("is not fooled by a lookalike attribute name or an unrelated tag", () => {
    const noise = `<link data-rel="canonical" href="/decoy">
<link rel="stylesheet" href="/app.css">
<meta name="itemname" content="decoy">
<meta name="ROBOTS" content="noindex, nofollow">
<link rel=canonical href=/unquoted>`;
    expect(extractCanonicals(noise)).toEqual(["/unquoted"]);
    expect(extractRobotsMetas(noise)).toEqual(["noindex, nofollow"]);
  });

  it("counts anchors with either quote style", () => {
    expect(extractAnchorHrefs(SHELL)).toEqual(["/one", "/two"]);
  });

  it("excludes script and style bodies from the text measure", () => {
    const text = htmlToText(SHELL);
    expect(text).toContain("Hello");
    expect(text).not.toContain("not text");
    expect(text).not.toContain("color:red");
  });

  it("notices a non-empty noscript block", () => {
    expect(hasNoscriptContent(SHELL)).toBe(true);
    expect(hasNoscriptContent("<noscript>  </noscript>")).toBe(false);
  });
});
