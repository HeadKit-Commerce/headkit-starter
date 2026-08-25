import { describe, expect, it } from "vitest";
import { slugFor } from "./slug";

describe("filename stems", () => {
  it("is stable for the same path", () => {
    expect(slugFor("/shop/a/b")).toBe(slugFor("/shop/a/b"));
  });

  it("does not collide between paths that sanitise alike", () => {
    // Without the hash these both reduce to `a_b`, and one artifact would
    // silently overwrite the other.
    expect(slugFor("/a/b")).not.toBe(slugFor("/a_b"));
  });

  it("names the root path", () => {
    expect(slugFor("/")).toMatch(/^root__[0-9a-f]{8}$/);
  });
});
