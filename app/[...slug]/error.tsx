"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function CmsPageError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center px-5 md:px-10">
      <div className="mx-auto max-w-md text-center">
        <h1 className="mb-2 text-3xl font-bold">Unable to load page</h1>
        <p className="mb-8 text-gray-600">
          This page is temporarily unavailable. Please try again.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Button onClick={reset}>Try again</Button>
          <Button variant="outline" asChild>
            <Link href="/">Go Home</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
