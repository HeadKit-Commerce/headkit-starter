import { describe, expect, it } from "vitest";
import {
  buildQuotePlaceholderAddress,
  encodeQuoteDetailsCookie,
  parseQuoteDetailsCookie,
} from "./quote-form";

describe("quote-form helpers", () => {
  const details = {
    email: "a@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "0400000000",
    company: "Analytical Engines",
    industry: "Education",
    state: "vic",
    comments: "Need classroom seating",
  };

  it("builds a Woo-compatible placeholder address with selected state", () => {
    const address = buildQuotePlaceholderAddress(details);
    expect(address.state).toBe("VIC");
    expect(address.country).toBe("AU");
    expect(address.address1).toBe("Quote request");
    expect(address.address2).toBe("Education");
    expect(address.email).toBe("a@example.com");
  });

  it("round-trips quote details cookie encoding", () => {
    const encoded = encodeQuoteDetailsCookie(details);
    const parsed = parseQuoteDetailsCookie(encoded);
    expect(parsed).toEqual(details);
  });

  it("returns null for malformed cookie payloads", () => {
    expect(parseQuoteDetailsCookie("not-json")).toBeNull();
    expect(parseQuoteDetailsCookie(null)).toBeNull();
  });
});
