"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClientSDK } from "@headkit/sdk";

import { refreshDelayMs } from "@/lib/jwt-exp";
import { getCustomer } from "@/lib/account-actions";
import { clearCartTokenAction } from "@/lib/cart-actions";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  token?: string | null | undefined;
  /**
   * Refresh token (FE-05) issued alongside the JWT on login/register. Held
   * with the auth JWT (sessionStorage `hk_auth_user`) — NEVER in the
   * `hk-cart-token` cookie. The silent-refresh timer exchanges it for a fresh
   * {authToken, refreshToken} pair shortly before the JWT expires. Optional so
   * a backend that has not yet minted one degrades to an inert timer.
   */
  refreshToken?: string | null | undefined;
}

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  /** Persist the user object (and optional token). */
  setUser: (user: AuthUser | null) => void;
  /**
   * Alias used by login / register flows.
   * Stores the JWT in a cookie and marks the user as authenticated.
   */
  setAuthToken: (token: string, user?: Partial<AuthUser>) => void;
  /** Sign out and optionally redirect. */
  signOut: (redirect?: boolean) => void;
  /** Alias for signOut(false). */
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const STORAGE_KEY = "hk_auth_user";
/** Auth token cookie. Client-set (no httpOnly) so token can be sent in Authorization header. */
const COOKIE_NAME = "hk-auth-token";

/**
 * Read the auth JWT from the `hk-auth-token` cookie. Returns `null` when the
 * cookie is absent or empty. Used to rehydrate the session in a fresh tab,
 * where the cookie (shared across tabs) survives but the per-tab
 * sessionStorage copy does not.
 */
function getCookieToken(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((c) => c.startsWith(`${COOKIE_NAME}=`));
  if (!match) return null;
  const token = match.slice(COOKIE_NAME.length + 1);
  return token.length > 0 ? token : null;
}

/** UI-SPEC session-expired copy (FE-05). Shown on a hard refresh failure. */
export const SESSION_EXPIRED_MESSAGE =
  "Your session expired. Please sign in again.";

/**
 * Outcome of a silent-refresh attempt, surfaced so the effect (and tests) can
 * branch without the function reaching into React/router internals itself.
 */
export type SilentRefreshOutcome =
  | { status: "refreshed"; authToken: string; refreshToken: string }
  | { status: "signed-out"; message: string };

/**
 * Pure orchestration for one silent-refresh attempt (FE-05), extracted so the
 * success and hard-failure paths are unit-testable in the node vitest env
 * (the app has no jsdom/testing-library setup; the provider can't render here).
 *
 * It calls `auth.refreshAuthToken(refreshToken)` and returns the new token pair
 * on success, or a `signed-out` outcome carrying the UI-SPEC copy on any
 * failure. It NEVER logs the token (T-03-R1) and never touches the cart-token
 * boundary — it only swaps the auth JWT/refresh pair.
 *
 * Refresh-token rotation is OPTIONAL (WR-02): the WP `/auth/refresh` contract
 * may return only a fresh `authToken` (today refreshToken == accessToken and
 * the field can be omitted). A fresh authToken alone is a successful refresh —
 * we keep the session and carry the prior refresh token forward. Only an
 * actual authToken-refresh failure (no usable new authToken, or a thrown error)
 * signs the user out. This prevents FE-05 from force-signing-out on every
 * refresh when WP omits the rotated refresh token.
 */
export async function runSilentRefresh(
  refreshToken: string,
  refreshAuthToken: (
    token: string,
  ) => Promise<{ authToken: string; refreshToken?: string | null }>,
): Promise<SilentRefreshOutcome> {
  try {
    const result = await refreshAuthToken(refreshToken);
    // Hard failure only when the authToken refresh itself fails (no usable new
    // authToken). A missing/omitted refreshToken is NOT a failure.
    if (!result?.authToken) {
      return { status: "signed-out", message: SESSION_EXPIRED_MESSAGE };
    }
    return {
      status: "refreshed",
      authToken: result.authToken,
      // Keep the prior refresh token when the response omits a rotated one
      // (WR-02). Never empty: falls back to the token we just used.
      refreshToken: result.refreshToken || refreshToken,
    };
  } catch {
    // Swallow the error detail (no token/internal leakage, T-03-R1/R3) — the
    // user only ever sees the generic session-expired copy.
    return { status: "signed-out", message: SESSION_EXPIRED_MESSAGE };
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setUserState(JSON.parse(stored) as AuthUser);
        setIsLoading(false);
        return;
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }

    // New-tab path: sessionStorage is per-tab and starts empty in a fresh tab,
    // but the `hk-auth-token` cookie is shared across tabs. Treat the cookie as
    // the source of truth — rehydrate the session from it so a logged-in user
    // doesn't see an empty/signed-out account in a new tab. Without this, `user`
    // stays null and the profile form (which reads `user.token`) renders blank.
    const token = getCookieToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      const result = await getCustomer(token);
      if (cancelled) return;
      if (result.success && result.data) {
        const rehydrated: AuthUser = {
          id: result.data.id,
          email: result.data.email,
          firstName: result.data.firstName ?? null,
          lastName: result.data.lastName ?? null,
          token,
          // The refresh token is not recoverable from the cookie. Current
          // backend uses the access token as the refresh token (see note above
          // runSilentRefresh), so carrying it forward keeps silent-refresh armed.
          refreshToken: token,
        };
        setUserState(rehydrated);
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(rehydrated));
      } else {
        // Cookie token is invalid/expired — clear it so the route guard can
        // redirect to sign-in instead of showing a half-authenticated page.
        document.cookie = `${COOKIE_NAME}=; Max-Age=0; path=/`;
      }
      setIsLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const persistUser = (u: AuthUser | null) => {
    setUserState(u);
    if (typeof window === "undefined") return;
    if (u) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(u));
    } else {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  };

  const setAuthToken = (token: string, partial?: Partial<AuthUser>) => {
    const u: AuthUser = {
      id: partial?.id ?? "",
      email: partial?.email ?? "",
      firstName: partial?.firstName ?? null,
      lastName: partial?.lastName ?? null,
      token,
      // Preserve/accept the refresh token alongside the JWT (FE-05). Stored in
      // sessionStorage with the rest of AuthUser — NOT in hk-cart-token.
      refreshToken: partial?.refreshToken ?? null,
    };
    persistUser(u);
    document.cookie = `${COOKIE_NAME}=${token}; path=/; SameSite=Lax`;
  };

  const signOut = (redirect = false) => {
    persistUser(null);
    document.cookie = `${COOKIE_NAME}=; Max-Age=0; path=/`;
    // Drop the httpOnly hk-cart-token too (server action — not reachable via
    // document.cookie). The cart token now carries the user's identity in WP
    // (theme resolves determine_current_user from it); leaving it behind would
    // keep the browser acting as the logged-out user on wc/store requests. A
    // fresh guest token is minted on the next cart op. Fire-and-forget: logout
    // UX must not block on the roundtrip.
    void clearCartTokenAction().catch(() => {});
    if (redirect) {
      router.push("/account");
    }
  };

  // FE-05 — silent token refresh. Re-armed whenever the JWT changes. The effect
  // schedules a single refresh ~30s before the token's `exp`; on success it
  // swaps in the new {authToken, refreshToken}; on hard failure it signs out
  // and routes to sign-in preserving the return path with the UI-SPEC copy.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = user?.token;
    const refreshToken = user?.refreshToken;
    // No token, or backend never minted a refresh token (03-02 deferred):
    // the timer is inert — do not crash, do not schedule.
    if (!token || !refreshToken) {
      if (token && !refreshToken) {
        // Visible-but-quiet signal that refresh is pending the backend, without
        // ever logging the token itself.
        console.warn(
          "[auth] silent refresh inert: no refreshToken on the session (backend has not minted one)",
        );
      }
      return;
    }

    const delay = refreshDelayMs(token);
    if (delay === null) return; // unparsable exp → can't schedule safely

    const sdk = createClientSDK({
      publicKey: process.env.NEXT_PUBLIC_HEADKIT_PUBLIC_KEY ?? "",
      url: process.env.NEXT_PUBLIC_GRAPHQL_URL ?? "",
    });

    const timer = setTimeout(() => {
      void (async () => {
        const outcome = await runSilentRefresh(refreshToken, (t) =>
          sdk.auth.refreshAuthToken(t),
        );
        if (outcome.status === "refreshed") {
          setAuthToken(outcome.authToken, {
            ...user,
            refreshToken: outcome.refreshToken,
          });
        } else {
          signOut(false);
          // Callback runs client-side only; window.location avoids the
          // usePathname() hook, which suspends prerendering under Cache
          // Components on routes without enumerated params.
          const returnPath = window.location.pathname || "/account/profile";
          router.push(`/account?return=${encodeURIComponent(returnPath)}`);
          // Surface the UI-SPEC session-expired copy (toast infra is mounted in
          // the account layout). Kept generic — reveals nothing about tokens.
          if (typeof window !== "undefined") {
            window.dispatchEvent(
              new CustomEvent("hk:session-expired", {
                detail: { message: outcome.message },
              }),
            );
          }
        }
      })();
    }, delay);

    return () => clearTimeout(timer);
    // Re-arm only when the JWT changes (router/pathname read via refs so a
    // navigation does not reset the timer). setAuthToken/signOut are stable
    // closures defined in this provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.token, user?.refreshToken]);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        setUser: persistUser,
        setAuthToken,
        signOut,
        logout: () => signOut(false),
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    if (process.env.NODE_ENV !== "production") {
      console.error("useAuth must be used within AuthProvider");
    }
    return {
      user: null,
      isLoading: true,
      isAuthenticated: false,
      setUser: () => {},
      setAuthToken: () => {},
      signOut: () => {},
      logout: () => {},
    };
  }
  return ctx;
}
