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

/**
 * Placeholder address fields required by WooCommerce Store API / shipping
 * calculation when the quote UI does not collect a full street address.
 */
export function buildQuotePlaceholderAddress(
  details: QuoteFormDetails,
): {
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
} {
  return {
    firstName: details.firstName,
    lastName: details.lastName,
    address1: "Quote request",
    address2: details.industry,
    city: "Quote",
    state: details.state.toUpperCase(),
    postcode: "2000",
    country: "AU",
    email: details.email,
    phone: details.phone,
  };
}

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
