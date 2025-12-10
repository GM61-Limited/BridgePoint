
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

  // Keep axios Authorization header in sync with our token
  useEffect(() => {
    api.setToken(state.token ?? null);
  }, [state.token]);

  // Bootstrap session on first load (cookie-based or after OAuth)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await api.getMe();
        if (!cancelled && me) {
          setState((s) => ({ ...s, user: me }));
        }
      } catch {
        // ignore — not logged in yet or /me not implemented
      } finally {
        if (!cancelled) {
          setState((s) => ({ ...s, bootstrapping: false }));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAuth = useCallback(
    ({ token, user }: { token?: string | null; user?: User | null }) => {
      setState((prev) => {
        const next: AuthState = {
          token: token !== undefined ? token : prev.token,
          user: user !== undefined ? user : prev.user,
          bootstrapping: false,
        };
        // Sync axios Authorization header
        api.setToken(next.token ?? null);
        return next;
      });
    },
    []
  );

  const clearAuth = useCallback(() => setAuth({ token: null, user: null }), [setAuth]);

  const login = useCallback(async (username: string, password: string) => {
    // api.login() returns { token, user? } — user is null with your backend
    const payload = await api.login(username, password);
    const token = payload?.token ?? null;
    const user = payload?.user ?? null;

    setAuth({ token, user });

    // If backend didn’t return user details, try to fetch them (optional)
    if (!user) {
      const me = await api.getMe().catch(() => null);
      if (me) setAuth({ user: me });
    }
  }, [setAuth]);

  const logout = useCallback(async () => {
    try {
      await api.logout(); // safe even for JWT-only backends
    } catch {
      // ignore failures; still clear client state
    } finally {
      clearAuth();
    }
  }, [clearAuth]);

  const refreshSession = useCallback(async () => {
    const me = await api.getMe().catch(() => null);
    setAuth({ user: me ?? null });
  }, [setAuth]);

  const value = useMemo<AuthCtx>(() => {
    const isAuthenticated = !!state.token || !!state.user;
    return {
      user: state.user,
      token: state.token,
      isAuthenticated,
      bootstrapping: state.bootstrapping,
      setAuth,
      clearAuth,
      login,
      logout,
      refreshSession,
    };
  }, [state, setAuth, clearAuth, login, logout, refreshSession]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}