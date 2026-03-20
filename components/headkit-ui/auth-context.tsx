"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export interface AuthUser {
  id: string;
  email: string;
  firstName?: string | null | undefined;
  lastName?: string | null | undefined;
  token?: string | null | undefined;
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
      } catch {
        sessionStorage.removeItem(STORAGE_KEY);
      }
    }
    setIsLoading(false);
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
    };
    persistUser(u);
    document.cookie = `${COOKIE_NAME}=${token}; path=/; SameSite=Lax`;
  };

  const signOut = (redirect = false) => {
    persistUser(null);
    document.cookie = `${COOKIE_NAME}=; Max-Age=0; path=/`;
    if (redirect) {
      router.push("/account");
    }
  };

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
