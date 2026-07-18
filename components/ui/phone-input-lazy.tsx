"use client";

import { Suspense, lazy } from "react";
import { Input } from "@/components/ui/input";
import type { PhoneInputProps } from "@/components/ui/phone-input";

/**
 * Lazy-loaded PhoneInput (RC-1 perf fix).
 *
 * react-phone-number-input + libphonenumber country metadata are ~60 KB gz;
 * loading the input through React.lazy keeps that weight in a checkout-only
 * async chunk instead of the shared client graph that catalog routes download.
 * (React.lazy rather than next/dynamic: the monorepo hoists two @types/react
 * copies and next/dynamic's generic rejects the forwardRef component type.)
 * The fallback mirrors the input's frame so the form doesn't jump when the
 * chunk arrives.
 */
const LazyPhoneInput = lazy(() =>
  import("@/components/ui/phone-input").then((m) => ({
    default: m.PhoneInput,
  })),
);

export function PhoneInput(props: PhoneInputProps): React.ReactElement {
  return (
    <Suspense fallback={<Input disabled placeholder="Enter phone number" />}>
      <LazyPhoneInput {...props} />
    </Suspense>
  );
}
