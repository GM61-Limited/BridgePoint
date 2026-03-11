// src/features/auth/AuthContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User } from "../../lib/api";
import * as api from "../../lib/api";

const TOKEN_KEY = "bp_token";

// Build a login path that respects Vite's BASE_URL and trailing slashes.
function buildLoginPath(): string {
  const base = (import.meta as any)?.env?.BASE_URL ?? "/";
  const normalisedBase = base.endsWith("/") ? base : `${base}/`;
  return `${normalisedBase}login`;
}

type AuthState = {
  user: User | null;
  token: string | null;
  bootstrapping: boolean;
};

type AuthCtx = {
  // state
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  bootstrapping: boolean;

  // actions
  setAuth: (payload: { token?: string | null; user?: User | null }) => void;
  clearAuth: () => void;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
};

const Ctx = createContext<AuthCtx | undefined>(undefined);

type AuthFailReason = "expired" | "unauthorized" | "refresh_failed";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    token: null,
    bootstrapping: true,
  });

  // Hydrate token synchronously so guards can decide immediately.
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored) {
      setState((s) => ({ ...s, token: stored }));
      api.setToken(stored);
    }
  }, []);

  // Keep API client header in sync
  useEffect(() => {
    api.setToken(state.token ?? null);
  }, [state.token]);

  const setAuth = useCallback(
    ({ token, user }: { token?: string | null; user?: User | null }) => {
      setState((prev) => {
        const next: AuthState = {
          token: token !== undefined ? token : prev.token,
          user: user !== undefined ? user : prev.user,
          bootstrapping: false,
        };

        if (token !== undefined) {
          if (token) localStorage.setItem(TOKEN_KEY, token);
          else localStorage.removeItem(TOKEN_KEY);
        }

        api.setToken(next.token ?? null);
        return next;
      });
    },
    []
  );

  const clearAuth = useCallback(() => {
    try {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.clear(); // optional: nuke ephemeral UI state
    } catch {
      /* ignore storage errors */
    }
    api.setToken(null);
    setState({ token: null, user: null, bootstrapping: false });
  }, []);

  // Bootstrap user profile (optional)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (state.token) {
          const me = await api.getMe();
          if (!cancelled && me) {
            setState((s) => ({ ...s, user: me }));
          }
        }
      } catch {
        // token invalid → clear it to avoid loops
        if (!cancelled) {
          localStorage.removeItem(TOKEN_KEY);
          setState((s) => ({ ...s, token: null }));
          api.setToken(null);
        }
      } finally {
        if (!cancelled) setState((s) => ({ ...s, bootstrapping: false }));
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.token]);

  const login = useCallback(
    async (username: string, password: string) => {
      const payload = await api.login(username, password); // { token, user? }
      const token = payload?.token ?? null;
      const user = payload?.user ?? null;

      setAuth({ token, user });

      if (!user && token) {
        const me = await api.getMe().catch(() => null);
        if (me) setAuth({ user: me });
      }
    },
    [setAuth]
  );

  /**
   * Centralised redirect helper (hard redirect prevents back navigation into protected routes)
   */
  const hardRedirectToLogin = useCallback((reason?: string) => {
    try {
      if (reason) sessionStorage.setItem("bp_auth_reason", reason);
    } catch {
      /* ignore */
    }

    const loginPath = buildLoginPath();
    if (window.location.pathname === loginPath) {
      window.location.reload();
    } else {
      window.location.replace(loginPath);
    }
  }, []);

  /**
   * Logout that fully refreshes the app:
   * - best-effort server call
   * - clear client state + storage
   * - optionally clear SW caches
   * - hard redirect to /login (replace)
   */
  const logout = useCallback(async () => {
    try {
      await api.logout(); // clears refresh cookie (best effort)
    } catch {
      // ignore; client cleanup continues
    }

    clearAuth();

    // Optional: clear Service Worker caches if you use a SW (harmless if not)
    try {
      if ("caches" in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      /* ignore cache cleanup errors */
    }

    hardRedirectToLogin("manual_logout");
  }, [clearAuth, hardRedirectToLogin]);

  /**
   * Forced logout used when:
   * - refresh fails
   * - token expires and cannot be refreshed
   * - API returns repeated 401
   *
   * Keep this separate from `logout()` to avoid any chance of loops.
   */
  const forceLogout = useCallback(
    async (reason: AuthFailReason) => {
      // Best-effort server logout (clears cookie); ignore failures
      try {
        await api.logout();
      } catch {
        /* ignore */
      }

      clearAuth();
      hardRedirectToLogin(reason);
    },
    [clearAuth, hardRedirectToLogin]
  );

  /**
   * ✅ NEW: register API auth-failure handler (from src/lib/api.ts)
   * This is what prevents "failed to load details" banners when token expires.
   */
  useEffect(() => {
    const maybeSetHandler = (api as any).setAuthFailureHandler as
      | ((handler: (reason: AuthFailReason) => void) => void)
      | undefined;

    if (typeof maybeSetHandler === "function") {
      maybeSetHandler((reason: AuthFailReason) => {
        void forceLogout(reason);
      });

      // Cleanup on unmount
      return () => maybeSetHandler(null as any);
    }

    return;
  }, [forceLogout]);

  // Backwards compatibility: global event → logout
  useEffect(() => {
    const onUnauthorised = () => void forceLogout("unauthorized");
    window.addEventListener("bp:unauthorised", onUnauthorised);
    return () => window.removeEventListener("bp:unauthorised", onUnauthorised);
  }, [forceLogout]);

  const value = useMemo<AuthCtx>(() => {
    const isAuthenticated = !!state.token; // JWT is the source of truth
    return {
      user: state.user,
      token: state.token,
      isAuthenticated,
      bootstrapping: state.bootstrapping,
      setAuth,
      clearAuth,
      login,
      logout,
      refreshSession: async () => {
        const me = await api.getMe().catch(() => null);
        setAuth({ user: me ?? null });
      },
    };
  }, [state, setAuth, clearAuth, login, logout]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}