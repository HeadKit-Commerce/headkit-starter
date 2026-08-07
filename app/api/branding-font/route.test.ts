import { beforeEach, describe, expect, it, vi } from "vitest";

describe("GET /api/branding-font", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("rejects unsafe file names", async () => {
    const { GET } = await import("@/app/api/branding-font/route");
    const res = await GET(
      new Request("http://localhost/api/branding-font?f=../secret.woff2"),
    );
    expect(res.status).toBe(404);
  });

  it("proxies a safe GCS branding font", async () => {
    const bytes = new Uint8Array([0, 1, 2, 3]).buffer;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(bytes, {
            status: 200,
            headers: { "Content-Type": "font/woff2" },
          }),
      ),
    );

    const { GET } = await import("@/app/api/branding-font/route");
    const res = await GET(
      new Request(
        "http://localhost/api/branding-font?f=store_branding_font_heading.woff2&v=1",
      ),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("font/woff2");
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(globalThis.fetch).toHaveBeenCalledWith(
      "https://storage.googleapis.com/headkit-storage/branding/store_branding_font_heading.woff2?v=1",
      expect.objectContaining({ next: { revalidate: 86_400 } }),
    );
  });
});
