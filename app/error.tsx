"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO: Report to error tracking service (Sentry, etc.)
    void error;
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 md:px-10">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-2 text-4xl font-extrabold text-primary">
          Something went wrong
        </h1>
        <p className="mb-8 text-gray-600">
          We encountered an unexpected error. Please try again or return to the
          home page.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button onClick={reset} variant="default">
            Try again
          </Button>
          <Link href="/">
            <Button variant="outline">Back to Home</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
