import { afterEach, describe, expect, it, vi } from "vitest";
import { logger } from "./logger";

/**
 * Structured JSON logger (D8) — the single approved logging boundary. These
 * tests spy on the underlying process streams (the sanctioned sink) and assert
 * each call emits exactly one machine-parseable JSON line with `level`+`event`
 * +passed fields, never throws, forwards error events to a registered Sentry
 * client, and never adds a secret field of its own.
 */
describe("logger — structured JSON boundary (D8)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as { Sentry?: unknown }).Sentry;
  });

  it("info emits ONE JSON line to stdout with level+event+fields", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    logger.info("revalidate", { requestId: "r1", count: 3, dropped: 0 });

    expect(spy).toHaveBeenCalledTimes(1);
    const line = spy.mock.calls[0]![0] as string;
    expect(line.endsWith("\n")).toBe(true);
    expect(JSON.parse(line)).toEqual({
      level: "info",
      event: "revalidate",
      requestId: "r1",
      count: 3,
      dropped: 0,
    });
  });

  it("error emits ONE JSON line to stderr with level=error", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    logger.error("revalidate.no_secret", { requestId: "r2" });

    expect(spy).toHaveBeenCalledTimes(1);
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({
      level: "error",
      event: "revalidate.no_secret",
      requestId: "r2",
    });
  });

  it("emits with no fields when the field bag is omitted", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    logger.info("ping");
    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({
      level: "info",
      event: "ping",
    });
  });

  it("never throws on a non-serializable (circular) field bag", () => {
    vi.spyOn(process.stdout, "write").mockReturnValue(true);
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(() => logger.info("evt", circular)).not.toThrow();
  });

  it("forwards error events to a registered Sentry client, no-op when absent", () => {
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    const captureMessage = vi.fn();
    (globalThis as { Sentry?: unknown }).Sentry = { captureMessage };

    logger.error("boom", { requestId: "r3" });
    expect(captureMessage).toHaveBeenCalledWith("boom", "error");

    delete (globalThis as { Sentry?: unknown }).Sentry;
    expect(() => logger.error("boom-again")).not.toThrow();
  });

  it("adds no field of its own — cannot leak a secret it was not given", () => {
    const spy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    logger.info("revalidate", { requestId: "r4" });
    expect(spy.mock.calls[0]![0]).not.toContain("secret");
  });
});
