import { describe, expect, it } from "vitest";
import { numberOption, parseArgv } from "./args";
import type { ArgSpec } from "./args";

const SPEC: ArgSpec = {
  value: ["base-url", "out", "min-interval-ms"],
  boolean: ["freeze-clock", "overwrite"],
};

const TOOL = "port-verify capture";

describe("declared options", () => {
  it("reads --key value, --key=value and bare switches", () => {
    const parsed = parseArgv(
      [
        "--base-url",
        "https://store.invalid",
        "--out=.port-verify/before",
        "--freeze-clock",
        "--overwrite",
      ],
      SPEC,
      TOOL,
    );
    expect(parsed.values.get("base-url")).toBe("https://store.invalid");
    expect(parsed.values.get("out")).toBe(".port-verify/before");
    expect(parsed.flags.has("freeze-clock")).toBe(true);
    expect(parsed.flags.has("overwrite")).toBe(true);
  });

  it("leaves an unpassed switch off", () => {
    const parsed = parseArgv(["--out", "x"], SPEC, TOOL);
    expect(parsed.flags.has("overwrite")).toBe(false);
  });

  it("accepts a bare switch immediately before another flag", () => {
    const parsed = parseArgv(["--overwrite", "--out", "x"], SPEC, TOOL);
    expect(parsed.flags.has("overwrite")).toBe(true);
    expect(parsed.values.get("out")).toBe("x");
  });
});

describe("an option that would be silently ignored is an error", () => {
  it("rejects a misspelt value flag, naming it", () => {
    // The live failure: --min-interval instead of --min-interval-ms left the
    // 250ms floor in place and swept a customer storefront eight times faster
    // than the operator asked.
    expect(() => parseArgv(["--min-interval", "2000"], SPEC, TOOL)).toThrow(
      /--min-interval is not a known option/,
    );
  });

  it("lists what it does accept", () => {
    expect(() => parseArgv(["--nope", "1"], SPEC, TOOL)).toThrow(
      /--min-interval-ms/,
    );
  });

  it("rejects a switch given a value rather than dropping the value", () => {
    // --freeze-clock true used to land in the value map, so the boolean lookup
    // missed it and clock pinning was silently off.
    expect(() => parseArgv(["--freeze-clock", "true"], SPEC, TOOL)).toThrow(
      /takes no value/,
    );
    expect(() => parseArgv(["--freeze-clock=true"], SPEC, TOOL)).toThrow(
      /takes no value/,
    );
  });

  it("rejects a value flag written bare", () => {
    expect(() => parseArgv(["--out"], SPEC, TOOL)).toThrow(/needs a value/);
    expect(() => parseArgv(["--out", "--overwrite"], SPEC, TOOL)).toThrow(
      /needs a value/,
    );
  });

  it("rejects a positional argument", () => {
    expect(() => parseArgv(["capture", "--out", "x"], SPEC, TOOL)).toThrow(
      /unexpected argument/,
    );
  });
});

describe("numeric options are validated, not coerced", () => {
  const values = new Map<string, string>();

  it("falls back when absent", () => {
    expect(numberOption(values, "concurrency", 2, 1, 8, TOOL)).toBe(2);
  });

  it("rejects a value that would become NaN and disable a check", () => {
    // `delta > NaN` is always false, so an unvalidated --pixel-threshold abc
    // reported zero screenshot differences across a whole sweep.
    const bad = new Map([["pixel-threshold", "abc"]]);
    expect(() => numberOption(bad, "pixel-threshold", 2, 0, 255, TOOL)).toThrow(
      /is not a number/,
    );
  });

  it("rejects an empty or whitespace value", () => {
    expect(() =>
      numberOption(
        new Map([["concurrency", "  "]]),
        "concurrency",
        2,
        1,
        8,
        TOOL,
      ),
    ).toThrow(/is not a number/);
  });

  it("rejects out-of-range and non-integer values, naming the range", () => {
    expect(() =>
      numberOption(
        new Map([["concurrency", "99"]]),
        "concurrency",
        2,
        1,
        8,
        TOOL,
      ),
    ).toThrow(/out of range \(expected a whole number 1-8\)/);
    expect(() =>
      numberOption(
        new Map([["concurrency", "1.5"]]),
        "concurrency",
        2,
        1,
        8,
        TOOL,
      ),
    ).toThrow(/out of range/);
    expect(() =>
      numberOption(
        new Map([["concurrency", "-1"]]),
        "concurrency",
        2,
        1,
        8,
        TOOL,
      ),
    ).toThrow(/out of range/);
  });

  it("accepts a value inside the range", () => {
    expect(
      numberOption(
        new Map([["concurrency", "8"]]),
        "concurrency",
        2,
        1,
        8,
        TOOL,
      ),
    ).toBe(8);
    expect(
      numberOption(
        new Map([["min-interval-ms", "0"]]),
        "min-interval-ms",
        250,
        0,
        600_000,
        TOOL,
      ),
    ).toBe(0);
  });
});
