"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CollectionError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-5 md:px-10">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-2 text-3xl font-bold text-primary">
          Unable to load collection
        </h1>
        <p className="mb-8 text-gray-600">
          We had trouble loading this collection. The page may have been moved
          or is temporarily unavailable.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button onClick={reset} variant="default">
            Try again
          </Button>
          <Link href="/collections">
            <Button variant="outline">Browse Collections</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
