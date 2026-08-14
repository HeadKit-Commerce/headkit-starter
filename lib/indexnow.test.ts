import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isIndexNowProductionHost,
  pathsToAbsoluteUrls,
  submitIndexNow,
} from "./indexnow";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

describe("pathsToAbsoluteUrls", () => {
  it("maps relative paths to absolute URLs on the host origin", () => {
    expect(
      pathsToAbsoluteUrls("https://shop.example.com", [
        "/products/a",
        "/shop",
        "/products/a",
      ]),
    ).toEqual([
      "https://shop.example.com/products/a",
      "https://shop.example.com/shop",
    ]);
  });

  it("drops non-relative and off-origin values", () => {
    expect(
      pathsToAbsoluteUrls("https://shop.example.com", [
        "https://evil.example/x",
        "//evil.example/x",
        "",
        "products/no-slash",
        "/ok",
      ]),
    ).toEqual(["https://shop.example.com/ok"]);
  });
});

describe("isIndexNowProductionHost", () => {
  it("is true only for Vercel production", () => {
    process.env.VERCEL_ENV = "production";
    expect(isIndexNowProductionHost()).toBe(true);

    process.env.VERCEL_ENV = "preview";
    expect(isIndexNowProductionHost()).toBe(false);
  });

  it("falls back to NODE_ENV when VERCEL_ENV unset", () => {
    delete process.env.VERCEL_ENV;
    vi.stubEnv("NODE_ENV", "production");
    expect(isIndexNowProductionHost()).toBe(true);

    vi.stubEnv("NODE_ENV", "development");
    expect(isIndexNowProductionHost()).toBe(false);
  });
});

describe("submitIndexNow", () => {
  it("POSTs host, key, keyLocation, and urlList", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ status: 200 });

    const result = await submitIndexNow(
      {
        hostOrigin: "https://shop.example.com",
        key: "abc12345def67890",
        paths: ["/products/1", "/products/2"],
        requestId: "req-1",
      },
      fetchImpl as unknown as typeof fetch,
    );

    expect(result).toMatchObject({
      submitted: true,
      urlCount: 2,
      status: 200,
    });
    expect(fetchImpl).toHaveBeenCalledOnce();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.indexnow.org/indexnow");
    expect(JSON.parse(String(init.body))).toEqual({
      host: "shop.example.com",
      key: "abc12345def67890",
      keyLocation: "https://shop.example.com/abc12345def67890.txt",
      urlList: [
        "https://shop.example.com/products/1",
        "https://shop.example.com/products/2",
      ],
    });
  });

  it("skips when there are no usable paths", async () => {
    const fetchImpl = vi.fn();
    const result = await submitIndexNow(
      {
        hostOrigin: "https://shop.example.com",
        key: "abc12345def67890",
        paths: ["not-a-path"],
      },
      fetchImpl as unknown as typeof fetch,
    );
    expect(result).toEqual({
      submitted: false,
      urlCount: 0,
      reason: "no_urls",
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
