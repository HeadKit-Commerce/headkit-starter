import Link from "next/link";
import { SearchIcon, HomeIcon, ArrowLeftIcon } from "@/components/icon";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 py-16 md:px-10">
      <div className="mx-auto max-w-lg text-center">
        <p className="text-6xl font-black text-primary/20 md:text-8xl">404</p>
        <h1 className="mt-2 text-2xl font-bold text-gray-900 md:text-3xl">
          Page not found
        </h1>
        <p className="mt-3 text-gray-600">
          The page you are looking for might have been removed, had its name
          changed, or is temporarily unavailable.
        </p>

        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link href="/">
            <Button variant="default" className="gap-2">
              <HomeIcon className="h-4 w-4" />
              Back to Home
            </Button>
          </Link>
          <Link href="/shop">
            <Button variant="outline" className="gap-2">
              <SearchIcon className="h-4 w-4" />
              Browse Products
            </Button>
          </Link>
        </div>

        <Link
          href="javascript:history.back()"
          className="mt-6 inline-flex items-center gap-1 text-sm text- hover:text-primary"
        >
          <ArrowLeftIcon className="h-3.5 w-3.5" />
          Go back to previous page
        </Link>
      </div>
    </div>
  );
}
