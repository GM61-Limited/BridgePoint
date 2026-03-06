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

// ---------- Typed endpoint helpers ----------
export type User = { id?: string; name?: string; roles?: string[] };

export async function login(username: string, password: string) {
  const { data } = await api.post<{ access_token?: string; token_type?: string }>(
    "/login",
    { username, password }
  );

  return {
    token: data?.access_token ?? null,
    user: null,
  } as { token?: string | null; user?: User | null };
}

export async function getMe() {
  const { data } = await api.get<User | null>("/me");
  return data;
}

export async function logout() {
  await api.post<void>("/logout");
}

export async function getOverview() {
  const { data } = await api.get("/overview");
  return data;
}

// ---------- SQL Connections ----------
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
    params: { envId },
  });
  return data;
}

export async function testSqlConnection(id: number) {
  const { data } = await api.post<{ id: number; ok: boolean; error?: string }>(
    `/v1/sql-connections/${id}/test`
  );
  return data;
}

export async function runSqlSelect<T = any>(
  id: number,
  sql: string,
  params: any[] = []
) {
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
  >("/environment/modules", {
    headers: { "X-Environment-Id": String(envId) },
  });

  if (Array.isArray(data)) return data as ModuleToggle[];
  return Array.isArray((data as any)?.modules)
    ? ((data as any).modules as ModuleToggle[])
    : [];
}

export async function putEnvironmentModules(
  envId: number,
  modules: ModuleToggle[]
) {
  const { data } = await api.put<{ environmentId?: number; modules?: ModuleToggle[] }>(
    "/environment/modules",
    { modules },
    { headers: { "X-Environment-Id": String(envId) } }
  );

  return Array.isArray((data as any)?.modules)
    ? ((data as any).modules as ModuleToggle[])
    : modules;
}

// ---------- Machines / Lookups ----------
// In src/lib/api.ts, inside export type Machine = { ... }
export type Machine = {
  id: number;
  environment_id: number;
  machine_name: string;
  machine_code: string;
  machine_type: string;
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

  // ✅ Optional “last cycle” fields (backend may already provide something like these)
  last_cycle_number?: number | string | null;
  last_program_name?: string | null;
  last_operator?: string | null;
  last_cycle_ended_at?: string | null;
  last_cycle_result?: boolean | string | null;
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

  const { data } = await api.post<WasherXmlUploadResponse>(
    "/v1/uploads/washer-xml",
    form
  );

  return data;
}

export function getApiErrorMessage(err: unknown): string {
  const e = err as AxiosError<any>;
  const status = e?.response?.status;
  const detail = (e?.response?.data as any)?.detail;

  if (typeof detail === "string")
    return status ? `${detail} (HTTP ${status})` : detail;

  if (typeof e?.response?.data === "string")
    return status
      ? `${e.response.data} (HTTP ${status})`
      : e.response.data;

  if (e?.message) return e.message;
  return "Unknown error";
}

// ---------- Washer XML uploads ----------
export type WasherXmlUploadRecord = {
  id: number;
  environment_code: string;
  machine_id: number;
  cycle_number?: string | null;
  original_filename: string;
  stored_filename: string;
  stored_path: string;
  bytes: number;
  uploaded_at: string;
  parse_status: string;
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

// ---------- Washer Cycles ----------
// ---------- Washer Cycles ----------
export type WasherCycleStage = {
  started_at?: string;
  ended_at?: string;
  temperature_c?: number;
};

// src/lib/api.ts (update WasherCycle type)
export type WasherCycle = {
  id: number;
  cycle_number: number | null;
  program_name: string | null;

  // ✅ add this (backend returns it)
  machine_id: number;

  // already in your type, keep it
  machine_name: string;

  started_at?: string;
  ended_at?: string | null;
  duration_sec?: number | null;

  // backend returns this too (nice to have)
  original_filename?: string | null;

  result: boolean | null;

  extra?: {
    stages?: {
      pre_wash?: WasherCycleStage;
      wash?: WasherCycleStage;
      rinse?: WasherCycleStage;
      disinfection?: WasherCycleStage;
      drying?: WasherCycleStage;
    };
  };
};

export async function listWasherCycles(): Promise<WasherCycle[]> {
  const res = await api.get("/v1/washer-cycles");
  return res.data.items;
}

export async function getWasherCycle(id: number): Promise<WasherCycle> {
  const res = await api.get(`/v1/washer-cycles/${id}`);
  return res.data;
}

// ---------- Telemetry (series-based, NEW) ----------
export type TelemetrySeries = {
  sensor: string;
  unit: string;
  series: [number, number][];
};

export interface WasherTelemetryResponse {
  cycle_id: number;
  started_at?: string;
  validation: {
    source: string;
    result: "PASS" | "FAIL" | "UNKNOWN";
    original_filename?: string | null;
  };
  points: TelemetrySeries[];
}

export async function getWasherCycleTelemetry(
  cycleId: number
): Promise<WasherTelemetryResponse> {
  const { data } = await api.get<WasherTelemetryResponse>(
    `/v1/washer-cycles/${cycleId}/telemetry`
  );
  return data;
}