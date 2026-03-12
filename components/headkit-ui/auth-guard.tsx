"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/headkit-ui/auth-context";

interface AuthGuardProps {
  children: React.ReactNode;
  /** When true, redirects to redirectTo if not authenticated. Default: true. */
  requireAuth?: boolean;
  /** Where to redirect when unauthenticated. Default: "/account". */
  redirectTo?: string;
}

/**
 * Client-side auth guard. Redirects when requireAuth is true and user is not authenticated.
 * Use as backup to middleware; useful for layouts or pages that need explicit guard logic.
 */
export function AuthGuard({
  children,
  requireAuth = true,
  redirectTo = "/account",
}: AuthGuardProps): React.ReactElement | null {
  const router = useRouter();
  const { isLoading, isAuthenticated } = useAuth();

  useEffect(() => {
    if (!requireAuth) return;
    if (!isLoading && !isAuthenticated) {
      router.replace(redirectTo);
    }
  }, [requireAuth, isLoading, isAuthenticated, redirectTo, router]);

  if (!requireAuth) {
    return <>{children}</>;
  }

  if (isLoading || !isAuthenticated) {
    return null;
  }

  return <>{children}</>;
}
