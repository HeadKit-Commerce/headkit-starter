import { afterEach, describe, expect, it, vi } from "vitest";
import { errorFields, logger } from "./logger";

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

/**
 * `errorFields` is how a caller satisfies the module contract above — the
 * logger cannot police a field bag it is handed, so the safe narrowing lives
 * beside the rule it enforces.
 */
describe("errorFields — bounded narrowing of a caught value", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps name/code/status and drops the message that carries the body", () => {
    const networkError = Object.assign(
      new Error("HeadKit authentication failed: consumer_key=ck_live_abc123"),
      { name: "NetworkError", code: "INVALID_KEY", status: 401 },
    );

    const fields = errorFields(networkError);

    expect(fields).toEqual({
      name: "NetworkError",
      code: "INVALID_KEY",
      status: 401,
    });
    expect(
      JSON.stringify(fields),
      "an SDK 401 puts the raw upstream response text in `error.message` " +
        "(threat T-09.5-07).",
    ).not.toContain("ck_live_abc123");
  });

  it("falls back to the message when neither bounded field exists", () => {
    expect(
      errorFields(new TypeError("fetch failed")),
      "`{ name: 'TypeError' }` alone detects a degrade without diagnosing it.",
    ).toEqual({ name: "TypeError", message: "fetch failed" });
  });

  it("keeps the message out once either bounded field is present", () => {
    expect(
      errorFields(
        Object.assign(new Error("HeadKit authentication failed: ck_live_abc"), {
          code: "INVALID_KEY",
        }),
      ),
      "every @headkit/sdk error carries a code, so the raw-body message can " +
        "never reach the fallback.",
    ).toEqual({ name: "Error", code: "INVALID_KEY" });

    expect(
      errorFields(
        Object.assign(new Error("HTTP 502: upstream body"), { status: 502 }),
      ),
    ).toEqual({ name: "Error", status: 502 });
  });

  it("ignores a non-string code and a non-number status", () => {
    const odd = Object.assign(new Error("boom"), {
      code: { nested: "secret-blob" },
      status: "401",
    });
    expect(errorFields(odd)).toEqual({ name: "Error", message: "boom" });
  });

  it("narrows a non-Error throw to its type, never its value", () => {
    expect(errorFields("consumer_key=ck_live_abc123")).toEqual({
      name: "non-error:string",
    });
    expect(errorFields({ token: "ck_live_abc123" })).toEqual({
      name: "non-error:object",
    });
  });

  it("emits one JSON line carrying only the narrowed fields", () => {
    const spy = vi.spyOn(process.stderr, "write").mockReturnValue(true);
    logger.error("pdp.degraded_render", {
      productSlug: "acme-hoodie",
      ...errorFields(
        Object.assign(new Error("HeadKit authentication failed: ck_live_abc"), {
          name: "NetworkError",
          code: "INVALID_KEY",
          status: 401,
        }),
      ),
    });

    expect(JSON.parse(spy.mock.calls[0]![0] as string)).toEqual({
      level: "error",
      event: "pdp.degraded_render",
      productSlug: "acme-hoodie",
      name: "NetworkError",
      code: "INVALID_KEY",
      status: 401,
    });
  });
});
