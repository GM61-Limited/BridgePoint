// src/pages/Settings.tsx
import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { useModules } from "../features/modules/ModulesContext";

/** --- API base (proxy-friendly default) --- */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

/** --- Types --- */
export type Organization = {
  id: string | number; // backend env id is numeric; tolerate string here
  name: string;
  domain: string;
  address?: string;
  timezone?: string;
};

export type OrgUpdate = Partial<Pick<Organization, "name" | "domain" | "address" | "timezone">>;

export type UserRow = {
  id: string;
  username: string; // backend username (separate from names)
  firstName: string; // mapped from backend first_name
  lastName: string; // mapped from backend last_name
  email: string;
  role: "admin" | "editor" | "viewer"; // mapped from "Admin" | "Editor" | "Viewer"
  active: boolean; // mapped from backend "is_active"
};

export type ConnectionSummary = {
  total: number;
  active: number;
  failed: number;
  lastUpdated?: string;
};

export type AppInfo = {
  version: string;
  commit?: string;
  buildTime?: string;
};

/** --- Modules (DB-backed, with local fallback) --- */
export type ModuleKey =
  | "machine-monitoring"
  | "finance"
  | "integration-hub"
  | "tray-archive"
  | "analytics";

export type ModuleRow = {
  key: ModuleKey;
  name: string;
  description?: string;
  enabled: boolean;
};

/** Canonical module catalogue (keep keys stable; names/descriptions are UI-only) */
const DEFAULT_MODULES: ModuleRow[] = [
  {
    key: "machine-monitoring",
    name: "Machine Monitoring",
    description: "Washers and device telemetry (MMM uploads, cycle graphs, history).",
    enabled: true,
  },
  {
    key: "finance",
    name: "Finance",
    description: "Costing, billing & chargebacks.",
    enabled: false,
  },
  {
    key: "integration-hub",
    name: "Integration Hub",
    description: "Pipelines & connectors for custom API integrations.",
    enabled: false,
  },
  {
    key: "tray-archive",
    name: "Tray Archive",
    description: "GS1 tray/instrument archive (later).",
    enabled: false,
  },
  {
    key: "analytics",
    name: "Analytics",
    description: "Dashboards & performance insights.",
    enabled: false,
  },
];

/** --- Connections placeholder only (backend not built yet) --- */
const PLACEHOLDER_SUMMARY: ConnectionSummary = {
  total: 5,
  active: 4,
  failed: 1,
  lastUpdated: new Date().toISOString(),
};

/** --- Helpers (headers, errors, role mapping, env id) --- */
function authHeaders(token: string | null) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function withEnvHeader(headers: Record<string, string>, environmentId: number | null) {
  if (environmentId == null) return headers;
  return { ...headers, "X-Environment-Id": String(environmentId) };
}

/** Robust error extraction to avoid "[object Object]" */
async function safeErrMsg(res: Response) {
  const fallback = `${res.status} ${res.statusText}`;
  try {
    const data = await res.json();

    // Typical fields
    const msg = data?.message || data?.error;
    if (typeof msg === "string" && msg.trim()) return msg.trim();

    // FastAPI/Pydantic validation errors
    const detail = data?.detail;
    if (Array.isArray(detail) && detail.length) {
      const parts = detail.map((d: any) => {
        const loc = Array.isArray(d?.loc) ? d.loc.join(".") : d?.loc;
        const m = d?.msg || d?.message || d?.detail;
        if (loc && m) return `${loc}: ${m}`;
        return typeof d === "string" ? d : JSON.stringify(d);
      });
      return parts.join("; ");
    }

    if (typeof detail === "string") return detail;

    // Last resort: stringify
    if (detail && typeof detail === "object") return JSON.stringify(detail);
    if (data && typeof data === "object") return JSON.stringify(data);

    return fallback;
  } catch {
    return fallback;
  }
}

function toUiRole(r: any): UserRow["role"] {
  const s = String(r ?? "").toLowerCase();
  if (s === "admin") return "admin";
  if (s === "editor") return "editor";
  if (s === "viewer") return "viewer";
  return "viewer";
}

function toBackendRole(r: UserRow["role"]): "Admin" | "Editor" | "Viewer" {
  return r === "admin" ? "Admin" : r === "editor" ? "Editor" : "Viewer";
}

/** Backend response shape for users */
type BackendUser = {
  id: number | string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  role: "Admin" | "Editor" | "Viewer" | string;
  environment_id: number | string;
  is_active?: boolean | null;
  created_at?: string;
  last_logged_in?: string | null;
};

function numericEnvId(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function normalizeUserRow(u: BackendUser): UserRow {
  return {
    id: String(u.id),
    username: String(u.username ?? ""),
    firstName: String(u.first_name ?? ""),
    lastName: String(u.last_name ?? ""),
    email: String(u.email ?? ""),
    role: toUiRole(u.role),
    active: Boolean(u.is_active ?? true),
  };
}

/** Build AppInfo from env if backend /version is not available */
function appInfoFromEnv(): AppInfo {
  const version = String(import.meta.env.VITE_APP_VERSION ?? "unknown");
  const commit = import.meta.env.VITE_GIT_SHA ? String(import.meta.env.VITE_GIT_SHA) : undefined;
  const buildTime = import.meta.env.VITE_BUILD_TIME ? String(import.meta.env.VITE_BUILD_TIME) : undefined;
  return { version, commit, buildTime };
}

/** --- Deep compare for dirty detection --- */
function rowsDiffer(a: UserRow, b: UserRow) {
  return (
    a.username !== b.username ||
    a.firstName !== b.firstName ||
    a.lastName !== b.lastName ||
    a.email !== b.email ||
    a.role !== b.role ||
    a.active !== b.active
  );
}

/** --- Local fallback persistence for modules (kept as backup) --- */
function modulesStorageKey(envId: number | null) {
  return envId == null ? "bridgepoint_modules:global" : `bridgepoint_modules:${envId}`;
}
function loadModulesFromStorage(envId: number | null): ModuleRow[] {
  try {
    const raw = localStorage.getItem(modulesStorageKey(envId));
    if (!raw) return DEFAULT_MODULES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Merge in case new modules were added later
      return mergeModules(DEFAULT_MODULES, parsed as any[]);
    }
    return DEFAULT_MODULES;
  } catch {
    return DEFAULT_MODULES;
  }
}
function saveModulesToStorage(envId: number | null, data: ModuleRow[]) {
  try {
    localStorage.setItem(modulesStorageKey(envId), JSON.stringify(data));
  } catch {
    /* ignore storage failures */
  }
}

/** --- Merge helper: ensure we always return all DEFAULT_MODULES keys in correct order --- */
function mergeModules(defaults: ModuleRow[], incoming: Array<{ key: string; enabled?: boolean }>): ModuleRow[] {
  const map = new Map<string, boolean>();
  for (const row of incoming) {
    if (row?.key) map.set(String(row.key), Boolean(row.enabled));
  }
  return defaults.map((d) => ({
    ...d,
    enabled: map.has(d.key) ? Boolean(map.get(d.key)) : d.enabled,
  }));
}

/** --- Settings page --- */
export default function Settings() {
  const { token } = useAuth();
  const { reload } = useModules(); // ✅ refresh module config after save

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [org, setOrg] = useState<Organization | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersDraft, setUsersDraft] = useState<UserRow[]>([]); // parent-level draft list
  const [bulkSaving, setBulkSaving] = useState(false); // disable inputs while bulk saving
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  // Organization edit state
  const [orgEdit, setOrgEdit] = useState<OrgUpdate>({});
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgEditing, setOrgEditing] = useState(false);

  // Users edit/add state
  const [userSaving, setUserSaving] = useState<string | null>(null); // used for per-row operations (e.g., reset pw)
  const [userAdding, setUserAdding] = useState(false);

  // Users pagination/show-more
  const DEFAULT_VISIBLE = 5;
  const [usersVisible, setUsersVisible] = useState<number>(DEFAULT_VISIBLE);

  // Connections (placeholder)
  const [summary, setSummary] = useState<ConnectionSummary | null>(PLACEHOLDER_SUMMARY);

  // Modules (DB-backed with fallback)
  const [modules, setModules] = useState<ModuleRow[]>([]); // UI draft
  const [modulesSaving, setModulesSaving] = useState(false);
  const [modulesDirty, setModulesDirty] = useState(false);
  const [modulesSource, setModulesSource] = useState<"api" | "local">("local");

  const baseHeaders = useMemo(() => authHeaders(token), [token]);

  /** --- Modules API helpers --- */
  async function fetchModulesFromApi(envId: number | null): Promise<ModuleRow[] | null> {
    try {
      const res = await fetch(`${API_BASE}/environment/modules`, {
        method: "GET",
        headers: withEnvHeader(baseHeaders, envId),
      });
      if (!res.ok) throw new Error(await safeErrMsg(res));

      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.modules) ? raw.modules : [];

      const merged = mergeModules(DEFAULT_MODULES, list as any[]);
      return merged;
    } catch (e: any) {
      console.warn("GET /environment/modules failed (falling back to localStorage):", e?.message ?? e);
      return null;
    }
  }

  async function saveModulesToApi(envId: number | null, data: ModuleRow[]): Promise<ModuleRow[] | null> {
    try {
      const payload = {
        modules: data.map((m) => ({ key: m.key, enabled: m.enabled })),
      };

      const res = await fetch(`${API_BASE}/environment/modules`, {
        method: "PUT",
        headers: withEnvHeader(baseHeaders, envId),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await safeErrMsg(res));

      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.modules) ? raw.modules : payload.modules;

      const merged = mergeModules(DEFAULT_MODULES, list as any[]);
      return merged;
    } catch (e: any) {
      console.warn("PUT /environment/modules failed:", e?.message ?? e);
      return null;
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        /** 1) Fetch environment first to know environment_id */
        let orgData: Organization | null = null;
        try {
          const res = await fetch(`${API_BASE}/environment`, { headers: baseHeaders });
          if (!res.ok) throw new Error(await safeErrMsg(res));
          orgData = await res.json();
        } catch (e: any) {
          console.warn("GET /environment failed:", e?.message ?? e);
          orgData = null;
          setError((prev) => prev ?? "Failed to load organization.");
        }

        const envId = numericEnvId(orgData?.id);

        /** 2) In parallel: users (scoped) and version and modules */
        const usersPromise = (async () => {
          try {
            const res = await fetch(`${API_BASE}/users`, {
              headers: withEnvHeader(baseHeaders, envId),
            });
            if (!res.ok) throw new Error(await safeErrMsg(res));
            const raw = await res.json();
            const list: BackendUser[] = Array.isArray(raw)
              ? (raw as any[])
              : Array.isArray((raw as any)?.users)
              ? (raw as any).users
              : [];
            const filtered = envId == null ? list : list.filter((u) => numericEnvId(u.environment_id) === envId);
            const normalized = filtered.map(normalizeUserRow);
            return normalized;
          } catch (e: any) {
            console.warn("GET /users failed:", e?.message ?? e);
            setError((prev) => prev ?? "Failed to load users.");
            return [] as UserRow[];
          }
        })();

        const versionPromise = (async () => {
          try {
            const res = await fetch(`${API_BASE}/version`, { headers: baseHeaders });
            if (!res.ok) throw new Error(await safeErrMsg(res));
            const raw = await res.json();
            const info: AppInfo = {
              version: String(raw.version ?? raw.app_version ?? appInfoFromEnv().version),
              commit: raw.commit ?? raw.git_sha ?? import.meta.env.VITE_GIT_SHA,
              buildTime: raw.buildTime ?? raw.built_at ?? import.meta.env.VITE_BUILD_TIME,
            };
            return info;
          } catch {
            return appInfoFromEnv();
          }
        })();

        const modulesPromise = (async () => {
          const fromApi = await fetchModulesFromApi(envId);
          if (fromApi) return { data: fromApi, source: "api" as const };

          const fromLocal = loadModulesFromStorage(envId);
          return { data: fromLocal, source: "local" as const };
        })();

        const [usersData, versionData, modulesData] = await Promise.all([usersPromise, versionPromise, modulesPromise]);

        if (!cancelled) {
          setOrg(orgData);
          setUsers(usersData);
          setUsersDraft(usersData.map((u) => ({ ...u })));
          setUsersVisible(DEFAULT_VISIBLE);
          setAppInfo(versionData);

          setSummary((prev) => {
            const base = prev ?? PLACEHOLDER_SUMMARY;
            return { ...base, lastUpdated: new Date().toISOString() };
          });

          setModules(modulesData.data);
          setModulesSource(modulesData.source);
          setModulesDirty(false);

          setOrgEdit({});
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          console.error(e);
          setError("Failed to load settings.");
          setLoading(false);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baseHeaders]);

  /** --- Organization editing --- */
  function startOrgEdit() {
    if (!org) return;
    setOrgEditing(true);
    setOrgEdit({
      name: org.name,
      domain: org.domain,
      address: org.address ?? "",
      timezone: org.timezone ?? "",
    });
  }
  function cancelOrgEdit() {
    setOrgEditing(false);
    setOrgEdit({});
  }
  async function saveOrgEdit() {
    if (!org) return;
    setOrgSaving(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/environment`, {
        method: "PATCH",
        headers: baseHeaders,
        body: JSON.stringify(orgEdit),
      });
      if (!res.ok) throw new Error(await safeErrMsg(res));
      const updated: Organization = await res.json();
      setOrg(updated);
      setOrgEditing(false);
      setOrgEdit({});
    } catch (err: any) {
      setError(err?.message ?? "Failed to update organization.");
    } finally {
      setOrgSaving(false);
    }
  }

  /** --- Users: reset password (per-row) --- */
  async function resetPassword(userId: string, newPassword: string) {
    const envId = numericEnvId(org?.id);
    try {
      setUserSaving(userId);
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}/reset-password`, {
        method: "POST",
        headers: withEnvHeader(baseHeaders, envId),
        body: JSON.stringify({ password: newPassword }),
      });
      if (!res.ok) throw new Error(await safeErrMsg(res));
      return true;
    } catch (err: any) {
      setError(err?.message ?? "Failed to reset password.");
      return false;
    } finally {
      setUserSaving(null);
    }
  }

  /** --- Users: add new user --- */
  async function addUser() {
    setUserAdding(true);
    setError(null);

    const envId = numericEnvId(org?.id);
    try {
      const res = await fetch(`${API_BASE}/users`, {
        method: "POST",
        headers: withEnvHeader(baseHeaders, envId),
        body: JSON.stringify({
          username: "new.user",
          first_name: null,
          last_name: null,
          email: null,
          role: toBackendRole("viewer"),
          is_active: true,
        }),
      });
      if (!res.ok) throw new Error(await safeErrMsg(res));

      const createdBackend: BackendUser = await res.json();
      const created = normalizeUserRow(createdBackend);
      setUsers((prev) => [created, ...prev]);
      setUsersDraft((prev) => [{ ...created }, ...prev]);
      setUsersVisible((v) => Math.max(v, DEFAULT_VISIBLE));
    } catch (err: any) {
      setError(err?.message ?? "Failed to create user.");
    } finally {
      setUserAdding(false);
    }
  }

  /** --- Users: global toolbar actions --- */
  const hasUsersDirty = usersDraft.some((d) => {
    const orig = users.find((u) => u.id === d.id);
    return orig ? rowsDiffer(orig, d) : true;
  });

  function discardAllUserChanges() {
    setUsersDraft(users.map((u) => ({ ...u })));
    setUsersVisible(DEFAULT_VISIBLE);
  }

  async function refreshUsersFromServer() {
    const envId = numericEnvId(org?.id);
    try {
      const res = await fetch(`${API_BASE}/users`, { headers: withEnvHeader(baseHeaders, envId) });
      if (!res.ok) throw new Error(await safeErrMsg(res));
      const raw = await res.json();
      const list: BackendUser[] = Array.isArray(raw)
        ? (raw as any[])
        : Array.isArray((raw as any)?.users)
        ? (raw as any).users
        : [];
      const filtered = envId == null ? list : list.filter((u) => numericEnvId(u.environment_id) === envId);
      const normalized = filtered.map(normalizeUserRow);
      setUsers(normalized);
      setUsersDraft(normalized.map((u) => ({ ...u })));
      setUsersVisible(DEFAULT_VISIBLE);
      setError(null);
    } catch (err: any) {
      setError(err?.message ?? "Failed to refresh users.");
    }
  }

  async function updateUser(row: UserRow) {
    setUserSaving(row.id);
    setError(null);

    const envId = numericEnvId(org?.id);
    try {
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(row.id)}`, {
        method: "PATCH",
        headers: withEnvHeader(baseHeaders, envId),
        body: JSON.stringify({
          username: row.username,
          first_name: row.firstName || null,
          last_name: row.lastName || null,
          email: row.email || null,
          role: toBackendRole(row.role),
          is_active: row.active,
        }),
      });
      if (!res.ok) throw new Error(await safeErrMsg(res));

      const updatedBackend: BackendUser = await res.json();
      const updated = normalizeUserRow(updatedBackend);
      setUsers((prev) => prev.map((u) => (u.id === row.id ? updated : u)));
      setUsersDraft((prev) => prev.map((u) => (u.id === row.id ? { ...updated } : u)));
    } catch (err: any) {
      setError(err?.message ?? "Failed to update user.");
    } finally {
      setUserSaving(null);
    }
  }

  async function saveAllUserChanges() {
    setBulkSaving(true);
    setError(null);
    try {
      for (const d of usersDraft) {
        const orig = users.find((u) => u.id === d.id);
        if (!orig || rowsDiffer(orig, d)) {
          await updateUser(d);
        }
      }
      setUsersDraft((prev) => prev.map((u) => ({ ...u })));
    } catch (err: any) {
      setError(err?.message ?? "Failed to save user changes.");
    } finally {
      setBulkSaving(false);
    }
  }

  /** --- Modules: toggle/save/reset --- */
  function toggleModule(key: ModuleKey, enabled: boolean) {
    setModules((prev) => {
      const next = prev.map((m) => (m.key === key ? { ...m, enabled } : m));
      setModulesDirty(true);
      return next;
    });
  }

  function resetModulesToDefault() {
    setModules(DEFAULT_MODULES);
    setModulesDirty(true);
  }

  async function saveModules() {
    setModulesSaving(true);
    setError(null);

    const envId = numericEnvId(org?.id);

    try {
      const saved = await saveModulesToApi(envId, modules);

      if (saved) {
        setModules(saved);
        setModulesSource("api");
        setModulesDirty(false);

        // ✅ KEY FIX: refresh module config so nav + guards update immediately
        await reload();

        return;
      }

      // Fallback: localStorage
      saveModulesToStorage(envId, modules);
      setModulesSource("local");
      setModulesDirty(false);

      setError((prev) => prev ?? "Saved locally (API not available yet).");
    } catch (err: any) {
      setError(err?.message ?? "Failed to save modules.");
    } finally {
      setModulesSaving(false);
    }
  }

  /** --- Derived: Users visibility --- */
  const totalUsers = usersDraft.length;
  const visibleUsers = usersDraft.slice(0, usersVisible);
  const canShowMore = usersVisible < totalUsers;
  const canShowLess = usersVisible > DEFAULT_VISIBLE;

  function showMoreUsers(step = 5) {
    setUsersVisible((v) => Math.min(v + step, totalUsers));
  }
  function showLessUsers() {
    setUsersVisible(DEFAULT_VISIBLE);
  }

  /** --- Render --- */
  if (loading) {
    return (
      <div className="container-xxl py-4">
        <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "40vh" }}>
          <div className="spinner-border" role="status" aria-label="Loading" />
        </div>
      </div>
    );
  }

  return (
    <div className="container-xxl py-3 settings-page">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Settings</h2>
        <div className="text-muted small">
          {summary?.lastUpdated ? <>Last updated: {new Date(summary.lastUpdated).toLocaleString()}</> : null}
        </div>
      </div>

      {error && (
        <div className="alert alert-warning" role="alert">
          {error}
        </div>
      )}

      {/* About BridgePoint */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center gap-2">
          <i className="bi bi-info-circle" aria-hidden="true" />
          <strong>About BridgePoint</strong>
        </div>
        <div className="card-body">
          {!appInfo ? (
            <div className="text-muted">Version information not available.</div>
          ) : (
            <div className="row g-3">
              <div className="col-md-4">
                <div className="text-muted small">Version</div>
                <div className="fw-semibold">{appInfo.version}</div>
              </div>
              {appInfo.commit ? (
                <div className="col-md-4">
                  <div className="text-muted small">Commit</div>
                  <div className="fw-semibold">
                    <code>{appInfo.commit.slice(0, 7)}</code>
                  </div>
                </div>
              ) : null}
              {appInfo.buildTime ? (
                <div className="col-md-4">
                  <div className="text-muted small">Built</div>
                  <div className="fw-semibold">{new Date(appInfo.buildTime).toLocaleString()}</div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>

      {/* Organization */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-buildings" aria-hidden="true" />
            <strong>Organization</strong>
          </div>
          {!orgEditing ? (
            <button className="btn btn-sm btn-outline-primary" onClick={startOrgEdit} disabled={!org}>
              <i className="bi bi-pencil" aria-hidden="true" /> Edit
            </button>
          ) : (
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-success" onClick={saveOrgEdit} disabled={orgSaving}>
                <i className="bi bi-check2" aria-hidden="true" /> Save
              </button>
              <button className="btn btn-sm btn-outline-secondary" onClick={cancelOrgEdit} disabled={orgSaving}>
                <i className="bi bi-x" aria-hidden="true" /> Cancel
              </button>
            </div>
          )}
        </div>
        <div className="card-body">
          {!org ? (
            <div className="text-muted">No organization data.</div>
          ) : (
            <div className="row g-3">
              <div className="col-md-6">
                <label className="form-label">Name</label>
                <input
                  className="form-control"
                  value={orgEditing ? orgEdit.name ?? "" : org.name}
                  onChange={(e) => setOrgEdit((p) => ({ ...p, name: e.target.value }))}
                  disabled={!orgEditing}
                />
              </div>
              <div className="col-md-6">
                <label className="form-label">Domain</label>
                <input
                  className="form-control"
                  value={orgEditing ? orgEdit.domain ?? "" : org.domain}
                  onChange={(e) => setOrgEdit((p) => ({ ...p, domain: e.target.value }))}
                  disabled={!orgEditing}
                />
              </div>
              <div className="col-md-8">
                <label className="form-label">Address</label>
                <input
                  className="form-control"
                  value={orgEditing ? orgEdit.address ?? "" : (org as any).address ?? ""}
                  onChange={(e) => setOrgEdit((p) => ({ ...p, address: e.target.value }))}
                  disabled={!orgEditing}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Timezone</label>
                <input
                  className="form-control"
                  value={orgEditing ? orgEdit.timezone ?? "" : (org as any).timezone ?? ""}
                  onChange={(e) => setOrgEdit((p) => ({ ...p, timezone: e.target.value }))}
                  disabled={!orgEditing}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Users */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-people" aria-hidden="true" />
            <strong>Users</strong>
            <span className="ms-2 text-muted small">
              ({Math.min(usersVisible, totalUsers)} of {totalUsers})
            </span>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={refreshUsersFromServer} disabled={userAdding || bulkSaving}>
              <i className="bi bi-arrow-clockwise" aria-hidden="true" /> Refresh
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={discardAllUserChanges} disabled={!hasUsersDirty || bulkSaving}>
              <i className="bi bi-arrow-counterclockwise" aria-hidden="true" /> Discard changes
            </button>
            <button className="btn btn-sm btn-primary" onClick={saveAllUserChanges} disabled={!hasUsersDirty || bulkSaving}>
              {bulkSaving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                <>
                  <i className="bi bi-check2" aria-hidden="true" /> Save changes
                </>
              )}
            </button>
            <button className="btn btn-sm btn-outline-primary" onClick={addUser} disabled={userAdding || bulkSaving}>
              {userAdding ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                  Adding…
                </>
              ) : (
                <>
                  <i className="bi bi-person-plus" aria-hidden="true" /> Add user
                </>
              )}
            </button>
          </div>
        </div>

        <div className="card-body" style={{ overflowX: "auto" }}>
          {usersDraft.length === 0 ? (
            <div className="text-muted">No users found.</div>
          ) : (
            <>
              <div className="table-responsive">
                <table className="table align-middle" style={{ tableLayout: "fixed" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "2%" }} aria-label="Unsaved change indicator"></th>
                      <th style={{ width: "16%" }}>Username</th>
                      <th style={{ width: "16%" }}>First name</th>
                      <th style={{ width: "16%" }}>Last name</th>
                      <th style={{ width: "24%" }}>Email</th>
                      <th style={{ width: "12%" }}>Role</th>
                      <th style={{ width: "6%" }} className="text-center">Active</th>
                      <th style={{ width: "8%" }} className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleUsers.map((draftRow) => {
                      const orig = users.find((u) => u.id === draftRow.id)!;
                      const rowDirty = rowsDiffer(orig, draftRow);
                      return (
                        <UserRowEditor
                          key={draftRow.id}
                          draft={draftRow}
                          onChange={(updated) =>
                            setUsersDraft((prev) => prev.map((u) => (u.id === draftRow.id ? updated : u)))
                          }
                          saving={Boolean(userSaving) || bulkSaving}
                          onResetPassword={resetPassword}
                          rowDirty={rowDirty}
                        />
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="d-flex justify-content-center gap-2 mt-2">
                {canShowMore && (
                  <button className="btn btn-sm btn-outline-primary" onClick={() => showMoreUsers(5)}>
                    Show more
                  </button>
                )}
                {canShowLess && (
                  <button className="btn btn-sm btn-outline-primary" onClick={showLessUsers}>
                    Show less
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modules */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-grid" aria-hidden="true" />
            <strong>Modules</strong>
          </div>
          <div className="d-flex gap-2">
            <button className="btn btn-sm btn-outline-secondary" onClick={resetModulesToDefault} disabled={modulesSaving}>
              <i className="bi bi-arrow-counterclockwise" aria-hidden="true" /> Reset to defaults
            </button>
            <button
              className="btn btn-sm btn-primary"
              onClick={saveModules}
              disabled={modulesSaving || !modulesDirty}
              title="Save module configuration"
            >
              {modulesSaving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                <>
                  <i className="bi bi-check2" aria-hidden="true" /> Save
                </>
              )}
            </button>
          </div>
        </div>
        <div className="card-body">
          {modules.length === 0 ? (
            <div className="text-muted">No modules available.</div>
          ) : (
            <>
              <div className="row g-3">
                {modules.map((m) => (
                  <div key={m.key} className="col-md-6">
                    <div className="p-3 border rounded d-flex align-items-start justify-content-between">
                      <div className="me-3">
                        <div className="fw-semibold">{m.name}</div>
                        {m.description ? <div className="text-muted small">{m.description}</div> : null}
                      </div>
                      <div className="form-check form-switch">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id={`mod-${m.key}`}
                          checked={m.enabled}
                          onChange={(e) => toggleModule(m.key, e.target.checked)}
                        />
                        <label className="form-check-label" htmlFor={`mod-${m.key}`}>
                          {m.enabled ? "Enabled" : "Disabled"}
                        </label>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="text-muted small mt-3">
                Source: <strong>{modulesSource === "api" ? "Database (API)" : "Local (fallback)"}</strong>
                {modulesSource === "local" ? " — API not available yet or failed." : null}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Connections (placeholder) */}
      <div className="card">
        <div className="card-header d-flex align-items-center gap-2">
          <i className="bi bi-plug" aria-hidden="true" />
          <strong>Connections</strong>
        </div>
        <div className="card-body">
          {!summary ? (
            <div className="text-muted">No connection summary available.</div>
          ) : (
            <div className="row g-3">
              <Stat title="Total" value={summary.total} icon="bi-diagram-3" />
              <Stat title="Active" value={summary.active} icon="bi-check-circle" />
              <Stat title="Failed" value={summary.failed} icon="bi-exclamation-triangle" />
              <div className="col-12">
                <NavLink to="/connectors" className="btn btn-sm btn-outline-primary">
                  Manage connectors
                </NavLink>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** --- Row editor component (users) --- */
function UserRowEditor({
  draft,
  onChange,
  saving,
  onResetPassword,
  rowDirty,
}: {
  draft: UserRow;
  onChange: (row: UserRow) => void;
  saving: boolean;
  onResetPassword: (userId: string, newPassword: string) => Promise<boolean>;
  rowDirty: boolean;
}) {
  const [showReset, setShowReset] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetOk, setResetOk] = useState<boolean>(false);

  async function handleConfirmReset() {
    setResetErr(null);
    setResetOk(false);
    if (!pw1) {
      setResetErr("Password is required.");
      return;
    }
    if (pw1 !== pw2) {
      setResetErr("Passwords do not match.");
      return;
    }

    setResetting(true);
    const ok = await onResetPassword(draft.id, pw1);
    setResetting(false);
    if (ok) {
      setResetOk(true);
      setPw1("");
      setPw2("");
      setTimeout(() => {
        setShowReset(false);
        setResetOk(false);
      }, 900);
    } else {
      setResetErr("Failed to reset password.");
    }
  }

  return (
    <>
      <tr>
        <td
          className="text-center"
          title={rowDirty ? "Unsaved changes" : ""}
          aria-label={rowDirty ? "Unsaved changes" : undefined}
        >
          {rowDirty ? (
            <span className="d-inline-block rounded-circle bg-primary" style={{ width: 8, height: 8 }} />
          ) : null}
        </td>

        <td>
          <input
            className="form-control form-control-sm"
            value={draft.username}
            onChange={(e) => onChange({ ...draft, username: e.target.value })}
            disabled={saving}
          />
        </td>
        <td>
          <input
            className="form-control form-control-sm"
            value={draft.firstName}
            onChange={(e) => onChange({ ...draft, firstName: e.target.value })}
            disabled={saving}
          />
        </td>
        <td>
          <input
            className="form-control form-control-sm"
            value={draft.lastName}
            onChange={(e) => onChange({ ...draft, lastName: e.target.value })}
            disabled={saving}
          />
        </td>
        <td>
          <input
            className="form-control form-control-sm"
            type="email"
            value={draft.email}
            onChange={(e) => onChange({ ...draft, email: e.target.value })}
            disabled={saving}
          />
        </td>
        <td>
          <select
            className="form-select form-select-sm"
            value={draft.role}
            onChange={(e) => onChange({ ...draft, role: e.target.value as UserRow["role"] })}
            disabled={saving}
          >
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </td>

        <td className="text-center">
          <div className="form-check form-switch d-flex justify-content-center align-items-center m-0 p-0">
            <input
              className="form-check-input"
              type="checkbox"
              checked={draft.active}
              onChange={(e) => onChange({ ...draft, active: e.target.checked })}
              disabled={saving}
              id={`active-${draft.id}`}
              aria-label={`Set ${draft.username} active`}
            />
          </div>
        </td>

        <td className="text-end">
          <button
            className="btn btn-sm btn-outline-danger"
            onClick={() => setShowReset(true)}
            disabled={saving}
            title="Reset password"
          >
            <i className="bi bi-key" aria-hidden="true" /> Reset
          </button>
        </td>
      </tr>

      {showReset && (
        <tr>
          <td colSpan={8}>
            <div className="border rounded p-3 bg-body-tertiary">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <strong>
                  Reset password for <code>{draft.username}</code>
                </strong>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => {
                    setShowReset(false);
                    setResetErr(null);
                    setResetOk(false);
                  }}
                  disabled={resetting}
                >
                  <i className="bi bi-x" aria-hidden="true" /> Close
                </button>
              </div>

              {resetErr && <div className="alert alert-warning py-2 mb-2">{resetErr}</div>}
              {resetOk && <div className="alert alert-success py-2 mb-2">Password updated.</div>}

              <div className="row g-2">
                <div className="col-md-4">
                  <label className="form-label form-label-sm">New password</label>
                  <input
                    type="password"
                    className="form-control form-control-sm"
                    value={pw1}
                    onChange={(e) => setPw1(e.target.value)}
                    disabled={resetting}
                  />
                </div>
                <div className="col-md-4">
                  <label className="form-label form-label-sm">Confirm password</label>
                  <input
                    type="password"
                    className="form-control form-control-sm"
                    value={pw2}
                    onChange={(e) => setPw2(e.target.value)}
                    disabled={resetting}
                  />
                </div>
                <div className="col-md-4 d-flex align-items-end justify-content-end">
                  <button className="btn btn-danger" onClick={handleConfirmReset} disabled={resetting}>
                    {resetting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                        Updating…
                      </>
                    ) : (
                      <>
                        <i className="bi bi-key" aria-hidden="true" /> Confirm reset
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

/** --- Small stat tile --- */
function Stat({ title, value, icon }: { title: string; value: React.ReactNode; icon: string }) {
  return (
    <div className="col-sm-4 col-md-3">
      <div className="p-3 border rounded d-flex align-items-center gap-2">
        <i className={`bi ${icon}`} aria-hidden="true" />
        <div>
          <div className="text-muted small">{title}</div>
          <div className="fw-semibold">{value}</div>
        </div>
      </div>
    </div>
  );
}