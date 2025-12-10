
// src/features/auth/AuthContext.tsx
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import type { User } from '../../lib/api';
import * as api from '../../lib/api';

const TOKEN_KEY = 'bp_token';

// Build a login path that respects Vite's BASE_URL and trailing slashes.
function buildLoginPath(): string {
  const base = (import.meta as any)?.env?.BASE_URL ?? '/';
  // Ensure base ends with '/', then append 'login'
  const normalisedBase = base.endsWith('/') ? base : `${base}/`;
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
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.token]);

  const setAuth = useCallback(
    ({ token, user }: { token?: string | null; user?: User | null }) => {
      setState((prev) => {
        const next: AuthState = {
          token: token !== undefined ? token : prev.token,
          user:  user  !== undefined ? user  : prev.user,
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
    } catch { /* ignore storage errors */ }
    api.setToken(null);
    setState({ token: null, user: null, bootstrapping: false });
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const payload = await api.login(username, password); // { token, user? }
    const token = payload?.token ?? null;
    const user  = payload?.user ?? null;

    setAuth({ token, user });

    if (!user && token) {
      const me = await api.getMe().catch(() => null);
      if (me) setAuth({ user: me });
    }
  }, [setAuth]);

  /**
   * Logout that fully refreshes the app:
   * - best-effort server call
   * - clear client state + storage
   * - optionally clear SW caches
   * - hard redirect to /login (replace)
   */
  const logout = useCallback(async () => {
    try {
      await api.logout(); // safe even if not implemented
    } catch {
      // ignore; client cleanup continues
    }

    // Client cleanup
    clearAuth();

    // Optional: clear Service Worker caches if you use a SW (harmless if not)
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch { /* ignore cache cleanup errors */ }

    // Hard refresh to login (replace avoids back-to-protected pages)
    const loginPath = buildLoginPath();
    if (window.location.pathname === loginPath) {
      window.location.reload();           // already at /login → just reload
    } else {
      window.location.replace(loginPath); // full navigation & reload
    }
  }, [clearAuth]);

  // Optional: global 401 → logout
  useEffect(() => {
    const onUnauthorised = () => void logout();
    window.addEventListener('bp:unauthorised', onUnauthorised);
    return () => window.removeEventListener('bp:unauthorised', onUnauthorised);
  }, [logout]);

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
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
