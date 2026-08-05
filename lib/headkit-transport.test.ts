import { describe, expect, it } from "vitest";
import { buildHeadkitTransportOpts } from "./headkit-transport";

describe("buildHeadkitTransportOpts", () => {
  it("sends the PUBLIC key as apiKey (x-headkit-key), never the secret", () => {
    const opts = buildHeadkitTransportOpts({
      url: "https://graph.example/graphql",
      publicKey: "pk_live_test",
      secretKey: "sk_live_test",
    });
    expect(opts.apiKey).toBe("pk_live_test");
    expect(opts.apiKey.startsWith("pk_")).toBe(true);
    expect(opts.secretKey).toBe("sk_live_test");
    expect(opts.url).toBe("https://graph.example/graphql");
  });

  it("omits secretKey when it equals the public key (local/dev collapse)", () => {
    const opts = buildHeadkitTransportOpts({
      url: "https://graph.example/graphql",
      publicKey: "pk_live_test",
      secretKey: "pk_live_test",
    });
    expect(opts.apiKey).toBe("pk_live_test");
    expect(opts.secretKey).toBeUndefined();
  });
});
