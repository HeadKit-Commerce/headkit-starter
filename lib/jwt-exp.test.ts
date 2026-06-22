import { describe, expect, it } from "vitest";

import { decodeJwtExp, refreshDelayMs } from "@/lib/jwt-exp";

/**
 * FE-05 — minimal JWT `exp`-claim decode + refresh-delay scheduling math.
 *
 * The auth context schedules a silent token refresh shortly before the JWT
 * expires. It only needs the `exp` claim — NOT signature verification (that is
 * the backend's job on every request). So this helper deliberately decodes ONLY
 * the payload segment and reads `exp`; it never pulls in a full JWT library.
 *
 * Both functions degrade safely (return null / 0) on malformed input so the
 * timer never throws in the provider.
 */

/** Build a JWT-shaped string with the given payload object (unsigned, base64url). */
function makeJwt(payload: Record<string, unknown>): string {
  const b64url = (obj: Record<string, unknown>) =>
    Buffer.from(JSON.stringify(obj))
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const body = b64url(payload);
  return `${header}.${body}.signature-not-verified`;
}

describe("decodeJwtExp", () => {
  it("returns the exp claim as epoch milliseconds for a valid token", () => {
    const expSeconds = 1_900_000_000; // far-future epoch seconds
    const token = makeJwt({ sub: "user-1", exp: expSeconds });
    expect(decodeJwtExp(token)).toBe(expSeconds * 1000);
  });

  it("returns null for a malformed token (not three segments)", () => {
    expect(decodeJwtExp("not-a-jwt")).toBeNull();
  });

  it("returns null for an empty / nullish token", () => {
    expect(decodeJwtExp("")).toBeNull();
    expect(decodeJwtExp(null)).toBeNull();
    expect(decodeJwtExp(undefined)).toBeNull();
  });

  it("returns null when the payload is not valid base64url JSON", () => {
    expect(decodeJwtExp("aaa.@@@not-base64@@@.ccc")).toBeNull();
  });

  it("returns null when the payload has no exp claim", () => {
    const token = makeJwt({ sub: "user-1" });
    expect(decodeJwtExp(token)).toBeNull();
  });

  it("returns null when exp is non-numeric", () => {
    const token = makeJwt({ exp: "soon" });
    expect(decodeJwtExp(token)).toBeNull();
  });
});

describe("refreshDelayMs", () => {
  const NOW = 1_000_000_000_000; // fixed "now" in ms

  it("schedules the refresh the safety margin before expiry", () => {
    const token = makeJwt({ exp: (NOW + 120_000) / 1000 }); // expires in 120s
    // 120s out minus the 30s margin => 90s delay.
    expect(refreshDelayMs(token, NOW)).toBe(90_000);
  });

  it("clamps to 0 when the token is already within the safety margin", () => {
    const token = makeJwt({ exp: (NOW + 5_000) / 1000 }); // expires in 5s
    expect(refreshDelayMs(token, NOW)).toBe(0);
  });

  it("clamps to 0 when the token is already expired", () => {
    const token = makeJwt({ exp: (NOW - 60_000) / 1000 });
    expect(refreshDelayMs(token, NOW)).toBe(0);
  });

  it("returns null (no schedule) for a token without a usable exp", () => {
    expect(refreshDelayMs("not-a-jwt", NOW)).toBeNull();
    expect(refreshDelayMs(null, NOW)).toBeNull();
  });
});
