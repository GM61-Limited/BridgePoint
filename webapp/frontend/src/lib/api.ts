
// src/lib/api.ts
import axios, { AxiosError, AxiosHeaders } from 'axios';

let bearerToken: string | null = null;

/** Set the token after login */
export function setToken(token: string | null) {
  bearerToken = token;
}

/**
 * Base URL strategy:
 * - Prefer VITE_API_BASE_URL if defined
 * - Else: default to /api (same-origin via Nginx proxy)
 * This avoids cross-origin calls and CORS headaches in containers.
 */
const computedBaseURL =
  import.meta.env.VITE_API_BASE_URL ?? '/api';

// Debug (remove when happy)
if (typeof window !== 'undefined') {
  // eslint-disable-next-line no-console
  console.debug('[api] baseURL:', computedBaseURL);
}

export const api = axios.create({
  baseURL: computedBaseURL,
  withCredentials: true, // enables cookies if server sets them
});

/** Safe header setter for axios v1 (handles AxiosHeaders vs plain object) */
function setHeader(
  headers: AxiosHeaders | Record<string, any>,
  key: string,
  value: string
) {
  if (headers instanceof AxiosHeaders) {
    headers.set(key, value);
  } else {
    headers[key] = value;
  }
}

/** Attach Authorization if we have a token; avoid reassigning headers */
api.interceptors.request.use((config) => {
  // ensure headers object exists
  if (!config.headers) {
    config.headers = new AxiosHeaders();
  }

  // Defaults (don’t clobber caller-provided values)
  setHeader(config.headers as any, 'Accept', 'application/json');

  // Set Content-Type only for bodies or when caller didn’t set one
  if ((config.method ?? 'get').toLowerCase() !== 'get') {
    const currentCt =
      config.headers instanceof AxiosHeaders
        ? config.headers.get('Content-Type')
        : (config.headers as any)['Content-Type'];

    if (!currentCt) {
      setHeader(config.headers as any, 'Content-Type', 'application/json');
    }
  }

  // Authorization
  if (bearerToken) {
    setHeader(config.headers as any, 'Authorization', `Bearer ${bearerToken}`);
  }

  // Keep credentials on (helps if you rely on server-set cookies)
  config.withCredentials = true;

  return config;
});

// Optional: centralize error handling (e.g., 401)
api.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    // if (error.response?.status === 401) { bearerToken = null; }
    return Promise.reject(error);
  }
);

// ---------- Typed endpoint helpers (adjust paths to match your backend) ----------
export type User = { id?: string; name?: string; roles?: string[] };

/**
 * Login with username/password.
 * Backend returns { access_token, token_type }.
 * We normalize to { token, user } so existing AuthContext code works unchanged.
 */
export async function login(username: string, password: string) {
  const { data } = await api.post<{ access_token?: string; token_type?: string }>(
    '/login',
    { username, password }
  );

  return {
    token: data?.access_token ?? null,
    // token_type is typically 'bearer'; interceptor sends "Bearer <token>"
    user: null, // fetch via getMe() later if you need user details
  } as { token?: string | null; user?: User | null };
}

/** For cookie-based sessions, returns the current user (or null) */
export async function getMe() {
  const { data } = await api.get<User | null>('/me');
  return data;
}

/** Logout for session or token-based flows */
export async function logout() {
  await api.post<void>('/logout');
}

/** Example protected resource */
export async function getOverview() {
  const { data } = await api.get('/overview');
  return data;
}
