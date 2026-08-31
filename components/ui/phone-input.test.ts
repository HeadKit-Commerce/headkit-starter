import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./phone-input.tsx", import.meta.url),
  "utf8",
);

describe("PhoneInput field appearance", () => {
  it("keeps the joined country/input seam on the brand border", () => {
    expect(source).toContain(
      "-ml-px rounded-e-lg rounded-s-none border-primary",
    );
    expect(source).toContain(
      "rounded-e-none rounded-s-lg border-primary border-r-0",
    );
  });

  it("preserves the white field surface when the browser autofills it", () => {
    expect(source).toContain("autofill:bg-white");
    expect(source).toContain("autofill:[box-shadow:inset_0_0_0_1000px_white]");
    expect(source).toContain("focus-visible:ring-primary");
    expect(source).toContain("aria-[invalid=true]:border-red-500");
    expect(source).toContain("disabled:border-neutral-200");
  });
});
