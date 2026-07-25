import type { Metadata } from "next";
import { GravityForm } from "@/components/gravity-form-lazy";

/**
 * Contact form's Gravity Forms id. Hardcoded so this page is self-contained and
 * ships in the starter template without requiring a matching WordPress page.
 * Point it at whichever GF form the store uses for contact enquiries.
 */
const CONTACT_FORM_ID = "1";

export const metadata: Metadata = {
  title: "Contact Us",
  description: "Get in touch with our team.",
};

/**
 * Shown when Gravity Forms isn't installed or the form can't load, so the
 * contact page still gives visitors a way to reach the store.
 */
function ContactFallback(): React.ReactElement {
  return (
    <div className="rounded-lg border border-gray-200 p-6 text-sm text-gray-600">
      <p>Our contact form is currently unavailable.</p>
      <p className="mt-2">
        Please email us at{" "}
        <a
          className="font-medium text-purple-800 underline"
          href="mailto:hello@example.com"
        >
          hello@example.com
        </a>{" "}
        and we&apos;ll get back to you.
      </p>
    </div>
  );
}

export default function ContactPage(): React.ReactElement {
  return (
    <div className="px-5 py-10 md:px-10 md:py-16">
      <div className="grid grid-cols-1 gap-8 md:grid-cols-2">
        <div>
          <h1 className="mb-6 text-3xl font-bold text-purple-800">
            Contact Us
          </h1>
          <p className="text-purple-800">
            Have a question? Fill in the form and our team will get back to you
            shortly.
          </p>
        </div>

        <div>
          <GravityForm
            formId={CONTACT_FORM_ID}
            fallback={<ContactFallback />}
          />
        </div>
      </div>
    </div>
  );
}
