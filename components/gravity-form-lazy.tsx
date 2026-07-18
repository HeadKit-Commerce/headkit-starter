"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Skeleton mirroring GravityForm's own loading state so the lazy chunk swap is
 * visually seamless. Kept local — importing it from gravity-form.tsx would pull
 * the full chunk back into the static graph and defeat the split.
 */
const GravityFormSkeleton = () => (
  <div className="flex w-full flex-col gap-2">
    <Skeleton className="h-10" />
    <Skeleton className="h-10" />
    <Skeleton className="h-10" />
    <Skeleton className="h-10" />
    <Skeleton className="h-24" />
    <Skeleton className="h-10" />
  </div>
);

/**
 * Lazy-loaded GravityForm (RC-1 perf fix).
 *
 * The static form component drags react-hook-form + zod resolver into every
 * route that references it; loading it via next/dynamic keeps that bundle in
 * an async chunk fetched only when a form actually renders (contact page,
 * opened PDP enquiry panel) instead of on the shared catalog-route path.
 */
export const GravityForm = dynamic(
  () => import("@/components/gravity-form").then((m) => m.GravityForm),
  { ssr: false, loading: GravityFormSkeleton },
);
