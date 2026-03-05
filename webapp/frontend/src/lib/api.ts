// src/lib/api.ts
import axios, { AxiosError, AxiosHeaders } from "axios";
import type { Environment, ModuleToggle } from "../features/modules/types";

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
const computedBaseURL = import.meta.env.VITE_API_BASE_URL ?? "/api";

// Debug (remove when happy)
if (typeof window !== "undefined") {
  // eslint-disable-next-line no-console
  console.debug("[api] baseURL:", computedBaseURL);
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
  setHeader(config.headers as any, "Accept", "application/json");

  const method = (config.method ?? "get").toLowerCase();

  // ✅ IMPORTANT: for FormData (multipart), do NOT set Content-Type.
  // Axios must set boundary automatically.
  const isFormData =
    typeof FormData !== "undefined" && config.data instanceof FormData;

  // Set Content-Type only for non-GET requests when caller didn't set one
  // and when data is NOT FormData.
  if (method !== "get" && !isFormData) {
    const currentCt =
      config.headers instanceof AxiosHeaders
        ? config.headers.get("Content-Type")
        : (config.headers as any)["Content-Type"];

    if (!currentCt) {
      setHeader(config.headers as any, "Content-Type", "application/json");
    }
  }

  // Authorization
  if (bearerToken) {
    setHeader(config.headers as any, "Authorization", `Bearer ${bearerToken}`);
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
    "/login",
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
  const { data } = await api.get<User | null>("/me");
  return data;
}

/** Logout for session or token-based flows */
export async function logout() {
  await api.post<void>("/logout");
}

/** Example protected resource */
export async function getOverview() {
  const { data } = await api.get("/overview");
  return data;
}

// ---------- SQL Connections (list/test/query) ----------

export type SqlConnection = {
  id: number;
  environment_id: number;
  name: string;
  host: string;
  database_name: string;
  port: number;
  table_name?: string | null;
  username: string;
  created_at: string;
};

export async function listSqlConnections(envId: number) {
  const { data } = await api.get<SqlConnection[]>(`/v1/sql-connections`, {
    params: { envId }, // backend route is /api/v1/sql-connections?envId=2
  });
  return data;
}

export async function testSqlConnection(id: number) {
  const { data } = await api.post<{ id: number; ok: boolean; error?: string }>(
    `/v1/sql-connections/${id}/test`
  );
  return data;
}

export async function runSqlSelect<T = any>(id: number, sql: string, params: any[] = []) {
  const { data } = await api.post<{ rows: T[]; count: number }>(
    `/v1/sql-connections/${id}/query`,
    { sql, params }
  );
  return data;
}

// ---------- Environment / Modules ----------

export async function getEnvironment() {
  const { data } = await api.get<Environment>("/environment");
  return data;
}

export async function getEnvironmentModules(envId: number) {
  const { data } = await api.get<
    { environmentId?: number; modules?: ModuleToggle[] } | ModuleToggle[]
  >("/environment/modules", { headers: { "X-Environment-Id": String(envId) } });

  // Backend returns { environmentId, modules } (expected), but handle plain array too
  if (Array.isArray(data)) return data as ModuleToggle[];
  return Array.isArray((data as any)?.modules) ? ((data as any).modules as ModuleToggle[]) : [];
}

export async function putEnvironmentModules(envId: number, modules: ModuleToggle[]) {
  const { data } = await api.put<{ environmentId?: number; modules?: ModuleToggle[] }>(
    "/environment/modules",
    { modules },
    { headers: { "X-Environment-Id": String(envId) } }
  );

  return Array.isArray((data as any)?.modules) ? ((data as any).modules as ModuleToggle[]) : modules;
}

// ---------- Machines / Lookups ----------

export type Machine = {
  id: number;
  environment_id: number;

  machine_name: string;
  machine_code: string;

  machine_type: string; // 'washer', 'steriliser', etc.
  manufacturer?: string | null;
  model?: string | null;
  serial_number?: string | null;

  ip_address?: string | null;
  port?: number | null;
  hostname?: string | null;
  protocol?: string | null;
  base_path?: string | null;

  location?: string | null;
  timezone?: string | null;
  notes?: string | null;

  is_active: boolean;
  integration_key?: string | null;

  created_at?: string;
  updated_at?: string;
};

export type MachineType = {
  key: string;
  display_name: string;
  description?: string | null;
  is_active: boolean;
};

export type IntegrationProfile = {
  key: string;
  display_name: string;
  description?: string | null;
  is_active: boolean;
};

/** Lookups */
export async function getMachineTypes() {
  const { data } = await api.get<{ items: MachineType[] }>(
    "/v1/lookups/machine-types"
  );
  return data.items;
}

export async function getIntegrationProfiles() {
  const { data } = await api.get<{ items: IntegrationProfile[] }>(
    "/v1/lookups/integration-profiles"
  );
  return data.items;
}

/** Machines */
export async function listMachines(params?: {
  machine_type?: string;
  is_active?: boolean;
  integration_key?: string;
  search?: string;
}) {
  const { data } = await api.get<{ items: Machine[] }>(
    "/v1/machines",
    { params }
  );
  return data.items;
}

export async function getMachine(id: number) {
  const { data } = await api.get<Machine>(`/v1/machines/${id}`);
  return data;
}

export async function createMachine(payload: Partial<Machine>) {
  const { data } = await api.post<Machine>(
    "/v1/machines",
    payload
  );
  return data;
}

export async function updateMachine(id: number, payload: Partial<Machine>) {
  const { data } = await api.put<Machine>(
    `/v1/machines/${id}`,
    payload
  );
  return data;
}

/**
 * Soft delete – sets is_active=false (backend implements as soft-delete)
 */
export async function deactivateMachine(id: number) {
  await api.delete<void>(`/v1/machines/${id}`);
}

// ---------- Uploads (Washer XML) ----------

export type WasherXmlUploadResponse = {
  ok: boolean;
  environment_code: string;
  machine_id: number;
  original_filename: string;
  stored_filename: string;
  stored_path: string;
  bytes: number;
  uploaded_at_utc: string;
};

export async function uploadWasherXml(params: {
  environmentCode: string;
  machineId: number;
  file: File;
  cycleNumber?: string;
}) {
  const form = new FormData();
  form.append("environment_code", params.environmentCode);
  form.append("machine_id", String(params.machineId));
  if (params.cycleNumber) form.append("cycle_number", params.cycleNumber);
  form.append("file", params.file);

  // DO NOT set Content-Type here; axios sets multipart boundary automatically
  const { data } = await api.post<WasherXmlUploadResponse>(
    "/v1/uploads/washer-xml",
    form
  );

  return data;
}

/** Utility: Extract a readable message from an Axios error */
export function getApiErrorMessage(err: unknown): string {
  const e = err as AxiosError<any>;
  const status = e?.response?.status;

  // FastAPI often returns {"detail": "..."} on errors
  const detail = (e?.response?.data as any)?.detail;
  if (typeof detail === "string") return status ? `${detail} (HTTP ${status})` : detail;

  // Sometimes it returns text/html or plain text
  if (typeof e?.response?.data === "string") return status ? `${e.response.data} (HTTP ${status})` : e.response.data;

  if (e?.message) return e.message;
  return "Unknown error";
}

export type WasherXmlUploadRecord = {
  id: number;
  environment_code: string;
  machine_id: number;
  cycle_number?: string | null;
  original_filename: string;
  stored_filename: string;
  stored_path: string;
  bytes: number;
  uploaded_at: string;     // ISO
  parse_status: string;    // "pending" for now
};

export async function listWasherXmlUploads(params?: {
  environmentCode?: string;
  machineId?: number;
  limit?: number;
}) {
  const { data } = await api.get<{ items: WasherXmlUploadRecord[] }>(
    "/v1/uploads/washer-xml",
    {
      params: {
        environment_code: params?.environmentCode,
        machine_id: params?.machineId,
        limit: params?.limit ?? 200,
      },
    }
  );
  return data.items;
}

export type WasherCycle = {
  id: number;
  cycle_number: number | null;
  program_name: string | null;
  started_at: string;
  machine_id: number;
  machine_name: string;
  original_filename?: string;
};

export async function listWasherCycles(): Promise<WasherCycle[]> {
  const res = await api.get("/v1/washer-cycles");
  return res.data.items;
}

export async function getWasherCycle(id: number): Promise<WasherCycle> {
  const res = await api.get(`/v1/washer-cycles/${id}`);
  return res.data;
}