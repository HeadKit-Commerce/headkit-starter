/** Shared constants and helpers for HeadKit Quote checkout. */

export const QUOTE_PAYMENT_METHOD = "headkit-quote";

export const QUOTE_DETAILS_COOKIE = "hk-quote-details";

export const QUOTE_INDUSTRIES = [
  "Hospitality",
  "Healthcare",
  "Education",
  "Other",
] as const;

export type QuoteIndustry = (typeof QUOTE_INDUSTRIES)[number];

/** Australian states/territories — same ISO codes Woo/Stripe address selects use. */
export const AU_STATES = [
  { value: "NSW", label: "New South Wales" },
  { value: "VIC", label: "Victoria" },
  { value: "QLD", label: "Queensland" },
  { value: "WA", label: "Western Australia" },
  { value: "SA", label: "South Australia" },
  { value: "TAS", label: "Tasmania" },
  { value: "ACT", label: "Australian Capital Territory" },
  { value: "NT", label: "Northern Territory" },
] as const;

export type QuoteFormDetails = {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  company: string;
  industry: string;
  state: string;
  comments: string;
};

export type QuoteCheckoutAddress = {
  firstName: string;
  lastName: string;
  address1: string;
  address2: string;
  city: string;
  state: string;
  postcode: string;
  country: string;
  email: string;
  phone: string;
};

/**
 * Minimal billing/shipping payload for quote checkout.
 *
 * Theme relaxes Store API address validation for `headkit-quote`, so street /
 * city / postcode are left empty. Identity (name + email) is required; phone
 * and optional state are passed through when present. Industry is surfaced via
 * address2 for confirmation display (also stored as order meta).
 */
export function buildQuoteCheckoutAddress(
  details: QuoteFormDetails,
): QuoteCheckoutAddress {
  return {
    firstName: details.firstName,
    lastName: details.lastName,
    address1: "",
    address2: details.industry,
    city: "",
    state: details.state ? details.state.toUpperCase() : "",
    postcode: "",
    country: "AU",
    email: details.email,
    phone: details.phone,
  };
}

/** @deprecated Use {@link buildQuoteCheckoutAddress}. */
export const buildQuotePlaceholderAddress = buildQuoteCheckoutAddress;

export function encodeQuoteDetailsCookie(details: QuoteFormDetails): string {
  return encodeURIComponent(JSON.stringify(details));
}

export function parseQuoteDetailsCookie(
  raw: string | undefined | null,
): QuoteFormDetails | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw)) as QuoteFormDetails;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.email !== "string"
    ) {
      return null;
    }
    return {
      email: parsed.email ?? "",
      firstName: parsed.firstName ?? "",
      lastName: parsed.lastName ?? "",
      phone: parsed.phone ?? "",
      company: parsed.company ?? "",
      industry: parsed.industry ?? "",
      state: parsed.state ?? "",
      comments: parsed.comments ?? "",
    };
  } catch {
    return null;
  }
}
