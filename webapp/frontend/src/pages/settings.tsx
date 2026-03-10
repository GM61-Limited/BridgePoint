// src/pages/Settings.tsx
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../features/auth/AuthContext";
import { useModules } from "../features/modules/ModulesContext";

/** --- API base (proxy-friendly default) --- */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

/** --- Types --- */
export type Organization = {
  id: string | number;
  name: string;
  domain: string;
};

export type OrgUpdate = Partial<Pick<Organization, "name" | "domain">>;

export type UserRow = {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  active: boolean;
};

export type AppInfo = {
  version: string;
  commit?: string;
  buildTime?: string;
};

/** --- Modules --- */
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

const DEFAULT_MODULES: ModuleRow[] = [
  {
    key: "machine-monitoring",
    name: "Machine Monitoring",
    description: "Washers and device telemetry (uploads, cycle graphs, history).",
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

/** --- Helpers --- */
function authHeaders(token: string | null) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

function withEnvHeader(headers: Record<string, string>, environmentId: number | null) {
  if (environmentId == null) return headers;
  return { ...headers, "X-Environment-Id": String(environmentId) };
}

async function safeErrMsg(res: Response) {
  const fallback = `${res.status} ${res.statusText}`;
  try {
    const data = await res.json();
    const msg = data?.message || data?.error;
    if (typeof msg === "string" && msg.trim()) return msg.trim();

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

type BackendUser = {
  id: number | string;
  username: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  role: "Admin" | "Editor" | "Viewer" | string;
  environment_id: number | string;
  is_active?: boolean | null;
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

function appInfoFromEnv(): AppInfo {
  const version = String(import.meta.env.VITE_APP_VERSION ?? "unknown");
  const commit = import.meta.env.VITE_GIT_SHA ? String(import.meta.env.VITE_GIT_SHA) : undefined;
  const buildTime = import.meta.env.VITE_BUILD_TIME ? String(import.meta.env.VITE_BUILD_TIME) : undefined;
  return { version, commit, buildTime };
}

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

function modulesStorageKey(envId: number | null) {
  return envId == null ? "bridgepoint_modules:global" : `bridgepoint_modules:${envId}`;
}
function loadModulesFromStorage(envId: number | null): ModuleRow[] {
  try {
    const raw = localStorage.getItem(modulesStorageKey(envId));
    if (!raw) return DEFAULT_MODULES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return mergeModules(DEFAULT_MODULES, parsed as any[]);
    return DEFAULT_MODULES;
  } catch {
    return DEFAULT_MODULES;
  }
}
function saveModulesToStorage(envId: number | null, data: ModuleRow[]) {
  try {
    localStorage.setItem(modulesStorageKey(envId), JSON.stringify(data));
  } catch {}
}
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

/** Extract role from AuthContext user (supports role or roles[]) */
function extractMyRole(authUser: any): "admin" | "editor" | "viewer" {
  if (!authUser) return "viewer";
  if (Array.isArray(authUser.roles)) {
    const roles = authUser.roles.map((r: any) => String(r).toLowerCase());
    if (roles.includes("admin")) return "admin";
    if (roles.includes("editor")) return "editor";
    if (roles.includes("viewer")) return "viewer";
  }
  const role = (authUser.role ?? authUser.user_role ?? authUser.userRole ?? "").toString().toLowerCase();
  if (role === "admin") return "admin";
  if (role === "editor") return "editor";
  if (role === "viewer") return "viewer";
  return "viewer";
}

type ApiHealth = { ok: boolean; time?: string; message?: string };

export default function Settings() {
  const { token, user: authUser } = useAuth();
  const { reload } = useModules();

  const myRole = useMemo(() => extractMyRole(authUser), [authUser]);
  const isAdmin = myRole === "admin";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [org, setOrg] = useState<Organization | null>(null);

  const [me, setMe] = useState<UserRow | null>(null);
  const [meDraft, setMeDraft] = useState<UserRow | null>(null);
  const [meSaving, setMeSaving] = useState(false);
  const [meDirty, setMeDirty] = useState(false);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [usersDraft, setUsersDraft] = useState<UserRow[]>([]);
  const [bulkSaving, setBulkSaving] = useState(false);
  const [userSaving, setUserSaving] = useState<string | null>(null);
  const [userAdding, setUserAdding] = useState(false);

  const DEFAULT_VISIBLE = 5;
  const [usersVisible, setUsersVisible] = useState<number>(DEFAULT_VISIBLE);

  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  // About: API health
  const [apiHealth, setApiHealth] = useState<"unknown" | "healthy" | "unhealthy">("unknown");
  const [apiHealthMsg, setApiHealthMsg] = useState<string | null>(null);

  // Organization edit state
  const [orgEdit, setOrgEdit] = useState<OrgUpdate>({});
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgEditing, setOrgEditing] = useState(false);

  // Modules
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [modulesSaving, setModulesSaving] = useState(false);
  const [modulesDirty, setModulesDirty] = useState(false);
  const [modulesSource, setModulesSource] = useState<"api" | "local">("local");

  // UI: last refreshed timestamp
  const [lastRefreshedAt, setLastRefreshedAt] = useState<string>(() => new Date().toISOString());

  // Legal toggles
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [showAuditNotice, setShowAuditNotice] = useState(false);

  const baseHeaders = useMemo(() => authHeaders(token), [token]);

  async function fetchModulesFromApi(envId: number | null): Promise<ModuleRow[] | null> {
    try {
      const res = await fetch(`${API_BASE}/environment/modules`, {
        method: "GET",
        headers: withEnvHeader(baseHeaders, envId),
      });
      if (!res.ok) throw new Error(await safeErrMsg(res));
      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.modules) ? raw.modules : [];
      return mergeModules(DEFAULT_MODULES, list as any[]);
    } catch (e: any) {
      console.warn("GET /environment/modules failed:", e?.message ?? e);
      return null;
    }
  }

  async function saveModulesToApi(envId: number | null, data: ModuleRow[]): Promise<ModuleRow[] | null> {
    try {
      const payload = { modules: data.map((m) => ({ key: m.key, enabled: m.enabled })) };
      const res = await fetch(`${API_BASE}/environment/modules`, {
        method: "PUT",
        headers: withEnvHeader(baseHeaders, envId),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await safeErrMsg(res));
      const raw = await res.json();
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.modules) ? raw.modules : payload.modules;
      return mergeModules(DEFAULT_MODULES, list as any[]);
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
        // API health (non-blocking)
        (async () => {
          try {
            const res = await fetch(`${API_BASE}/health`, { headers: baseHeaders });
            if (!res.ok) throw new Error(await safeErrMsg(res));
            const raw: ApiHealth = await res.json();
            if (!cancelled) {
              setApiHealth(raw?.ok ? "healthy" : "unhealthy");
              setApiHealthMsg(raw?.ok ? null : (raw?.message ?? "Unhealthy"));
            }
          } catch (e: any) {
            if (!cancelled) {
              setApiHealth("unhealthy");
              setApiHealthMsg(e?.message ?? "Unhealthy");
            }
          }
        })();

        // 1) Environment
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

        // 2) /me
        const mePromise = (async () => {
          try {
            const res = await fetch(`${API_BASE}/me`, { headers: baseHeaders });
            if (!res.ok) throw new Error(await safeErrMsg(res));
            const raw = await res.json();
            const adapted: BackendUser = {
              id: raw?.id ?? raw?.user_id ?? raw?.userId,
              username: raw?.username ?? raw?.email ?? raw?.name ?? "me",
              first_name: raw?.first_name ?? raw?.firstName ?? null,
              last_name: raw?.last_name ?? raw?.lastName ?? null,
              email: raw?.email ?? raw?.user_email ?? null,
              role: raw?.role ?? raw?.user_role ?? raw?.userRole ?? "Viewer",
              environment_id: raw?.environment_id ?? raw?.env_id ?? envId ?? 0,
              is_active: raw?.is_active ?? raw?.isActive ?? true,
            };
            return normalizeUserRow(adapted);
          } catch (e: any) {
            console.warn("GET /me failed:", e?.message ?? e);
            return null as UserRow | null;
          }
        })();

        // 3) Version
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

        // 4) Admin-only: users + modules
        const usersPromise = (async () => {
          if (!isAdmin) return [] as UserRow[];
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
            return filtered.map(normalizeUserRow);
          } catch (e: any) {
            console.warn("GET /users failed:", e?.message ?? e);
            setError((prev) => prev ?? "Failed to load users.");
            return [] as UserRow[];
          }
        })();

        const modulesPromise = (async () => {
          if (!isAdmin) return { data: [] as ModuleRow[], source: "api" as const };
          const fromApi = await fetchModulesFromApi(envId);
          if (fromApi) return { data: fromApi, source: "api" as const };
          return { data: loadModulesFromStorage(envId), source: "local" as const };
        })();

        const [meData, versionData, usersData, modulesData] = await Promise.all([
          mePromise,
          versionPromise,
          usersPromise,
          modulesPromise,
        ]);

        if (!cancelled) {
          setOrg(orgData);

          setMe(meData);
          setMeDraft(meData ? { ...meData } : null);
          setMeDirty(false);

          setAppInfo(versionData);

          setUsers(usersData);
          setUsersDraft(usersData.map((u) => ({ ...u })));
          setUsersVisible(DEFAULT_VISIBLE);

          setModules(modulesData.data);
          setModulesSource(modulesData.source);
          setModulesDirty(false);

          setOrgEdit({});
          setLastRefreshedAt(new Date().toISOString());
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
  }, [baseHeaders, isAdmin]);

  async function copyDiagnostics() {
    const lines: string[] = [];
    lines.push("BridgePoint diagnostics");
    lines.push("----------------------");
    if (appInfo?.version) lines.push(`Version: ${appInfo.version}`);
    if (appInfo?.commit) lines.push(`Commit: ${String(appInfo.commit).slice(0, 12)}`);
    if (appInfo?.buildTime) lines.push(`Built: ${appInfo.buildTime}`);
    lines.push(`API: ${apiHealth}${apiHealthMsg ? ` (${apiHealthMsg})` : ""}`);
    lines.push(`Generated: ${new Date().toISOString()}`);

    try {
      await navigator.clipboard.writeText(lines.join("\n"));
      setError("Copied diagnostics to clipboard.");
      setTimeout(() => setError(null), 1200);
    } catch {
      setError("Could not copy to clipboard (browser permissions).");
      setTimeout(() => setError(null), 1800);
    }
  }

  function startOrgEdit() {
    if (!org || !isAdmin) return;
    setOrgEditing(true);
    setOrgEdit({ name: org.name, domain: org.domain });
  }
  function cancelOrgEdit() {
    setOrgEditing(false);
    setOrgEdit({});
  }
  async function saveOrgEdit() {
    if (!org || !isAdmin) return;
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

  function updateMeDraft(patch: Partial<UserRow>) {
    setMeDraft((prev) => {
      if (!prev) return prev;
      setMeDirty(true);
      return { ...prev, ...patch };
    });
  }
  function discardMeChanges() {
    setMeDraft(me ? { ...me } : null);
    setMeDirty(false);
  }
  async function saveMe() {
    if (!meDraft || !me) return;
    setMeSaving(true);
    setError(null);

    const envId = numericEnvId(org?.id);

    try {
      const payload = {
        first_name: meDraft.firstName || null,
        last_name: meDraft.lastName || null,
        email: meDraft.email || null,
        username: meDraft.username,
      };

      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(me.id)}`, {
        method: "PATCH",
        headers: withEnvHeader(baseHeaders, envId),
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(await safeErrMsg(res));

      const updatedBackend: BackendUser = await res.json();
      const updated = normalizeUserRow(updatedBackend);

      setMe(updated);
      setMeDraft({ ...updated });
      setMeDirty(false);
      setLastRefreshedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? "Failed to update your profile.");
    } finally {
      setMeSaving(false);
    }
  }

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

  async function deleteUser(userId: string) {
    if (!isAdmin) return;
    if (me?.id && String(me.id) === String(userId)) {
      setError("You cannot delete your own account.");
      return;
    }
    const confirmed = window.confirm("Are you sure you want to delete this user? This cannot be undone.");
    if (!confirmed) return;

    const envId = numericEnvId(org?.id);
    try {
      setUserSaving(userId);
      const res = await fetch(`${API_BASE}/users/${encodeURIComponent(userId)}`, {
        method: "DELETE",
        headers: withEnvHeader(baseHeaders, envId),
      });
      if (!(res.ok || res.status === 204)) throw new Error(await safeErrMsg(res));

      setUsers((prev) => prev.filter((u) => u.id !== userId));
      setUsersDraft((prev) => prev.filter((u) => u.id !== userId));
      setLastRefreshedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? "Failed to delete user.");
    } finally {
      setUserSaving(null);
    }
  }

  async function addUser() {
    if (!isAdmin) return;
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

  const hasUsersDirty = useMemo(() => {
    if (!isAdmin) return false;
    return usersDraft.some((d) => {
      const orig = users.find((u) => u.id === d.id);
      return orig ? rowsDiffer(orig, d) : true;
    });
  }, [isAdmin, usersDraft, users]);

  function discardAllUserChanges() {
    if (!isAdmin) return;
    setUsersDraft(users.map((u) => ({ ...u })));
    setUsersVisible(DEFAULT_VISIBLE);
  }

  async function refreshUsersFromServer() {
    if (!isAdmin) return;
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
      setLastRefreshedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? "Failed to refresh users.");
    }
  }

  async function updateUser(row: UserRow) {
    if (!isAdmin) return;

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
    if (!isAdmin) return;
    setBulkSaving(true);
    setError(null);
    try {
      for (const d of usersDraft) {
        const orig = users.find((u) => u.id === d.id);
        if (!orig || rowsDiffer(orig, d)) {
          await updateUser(d);
        }
      }
      setLastRefreshedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? "Failed to save user changes.");
    } finally {
      setBulkSaving(false);
    }
  }

  function toggleModule(key: ModuleKey, enabled: boolean) {
    if (!isAdmin) return;
    setModules((prev) => {
      setModulesDirty(true);
      return prev.map((m) => (m.key === key ? { ...m, enabled } : m));
    });
  }

  function resetModulesToDefault() {
    if (!isAdmin) return;
    setModules(DEFAULT_MODULES);
    setModulesDirty(true);
  }

  async function saveModules() {
    if (!isAdmin) return;
    setModulesSaving(true);
    setError(null);

    const envId = numericEnvId(org?.id);

    try {
      const saved = await saveModulesToApi(envId, modules);
      if (saved) {
        setModules(saved);
        setModulesSource("api");
        setModulesDirty(false);
        await reload();
        setLastRefreshedAt(new Date().toISOString());
        return;
      }

      saveModulesToStorage(envId, modules);
      setModulesSource("local");
      setModulesDirty(false);
      setError((prev) => prev ?? "Saved locally (API not available yet).");
      setLastRefreshedAt(new Date().toISOString());
    } catch (err: any) {
      setError(err?.message ?? "Failed to save modules.");
    } finally {
      setModulesSaving(false);
    }
  }

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
        <div className="text-muted small">Last refreshed: {new Date(lastRefreshedAt).toLocaleString()}</div>
      </div>

      {error && <div className="alert alert-warning" role="alert">{error}</div>}

      {/* About BridgePoint */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-info-circle" aria-hidden="true" />
            <strong>About BridgePoint</strong>
          </div>
          <button className="btn btn-sm btn-outline-secondary" onClick={copyDiagnostics}>
            <i className="bi bi-clipboard" aria-hidden="true" /> Copy diagnostics
          </button>
        </div>

        <div className="card-body">
          {!appInfo ? (
            <div className="text-muted">Version information not available.</div>
          ) : (
            <div className="row g-3 align-items-end">
              <div className="col-md-3">
                <div className="text-muted small">Version</div>
                <div className="fw-semibold">{appInfo.version}</div>
              </div>
              <div className="col-md-3">
                <div className="text-muted small">Commit</div>
                <div className="fw-semibold">
                  {appInfo.commit ? <code>{String(appInfo.commit).slice(0, 7)}</code> : <span className="text-muted">—</span>}
                </div>
              </div>
              <div className="col-md-3">
                <div className="text-muted small">Built</div>
                <div className="fw-semibold">
                  {appInfo.buildTime ? new Date(appInfo.buildTime).toLocaleString() : <span className="text-muted">—</span>}
                </div>
              </div>
              <div className="col-md-3">
                <div className="text-muted small">API health</div>
                <div className="fw-semibold">
                  {apiHealth === "healthy" ? (
                    <span className="badge text-bg-success">Healthy</span>
                  ) : apiHealth === "unhealthy" ? (
                    <span className="badge text-bg-danger" title={apiHealthMsg ?? undefined}>Unhealthy</span>
                  ) : (
                    <span className="badge text-bg-secondary">Unknown</span>
                  )}
                  {apiHealthMsg ? <span className="text-muted ms-2 small">{apiHealthMsg}</span> : null}
                </div>
              </div>
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

          {/* ✅ Hide edit controls entirely unless admin */}
          {isAdmin ? (
            !orgEditing ? (
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
            )
          ) : null}
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
            </div>
          )}
        </div>
      </div>

      {/* My Profile */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-person" aria-hidden="true" />
            <strong>My Profile</strong>
          </div>

          <div className="d-flex gap-2">
            <span className="badge text-bg-secondary text-uppercase">{myRole}</span>

            <button className="btn btn-sm btn-outline-secondary" onClick={discardMeChanges} disabled={!meDirty || meSaving}>
              Discard
            </button>
            <button className="btn btn-sm btn-primary" onClick={saveMe} disabled={!meDirty || meSaving || !meDraft}>
              {meSaving ? (
                <>
                  <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                  Saving…
                </>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </div>

        <div className="card-body">
          {!meDraft ? (
            <div className="text-muted">Profile not available.</div>
          ) : (
            <div className="row g-3">
              <div className="col-md-3">
                <label className="form-label">Username</label>
                <input className="form-control" value={meDraft.username} onChange={(e) => updateMeDraft({ username: e.target.value })} />
              </div>
              <div className="col-md-3">
                <label className="form-label">First name</label>
                <input className="form-control" value={meDraft.firstName} onChange={(e) => updateMeDraft({ firstName: e.target.value })} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Last name</label>
                <input className="form-control" value={meDraft.lastName} onChange={(e) => updateMeDraft({ lastName: e.target.value })} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Email</label>
                <input className="form-control" type="email" value={meDraft.email} onChange={(e) => updateMeDraft({ email: e.target.value })} />
              </div>
              <div className="col-12">
                <div className="text-muted small">Tip: User management and module configuration are restricted to administrators.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Users (admin only) */}
      {isAdmin && (
        <div className="card mb-3">
          <div className="card-header d-flex align-items-center justify-content-between">
            <div className="d-flex align-items-center gap-2">
              <i className="bi bi-people" aria-hidden="true" />
              <strong>Users</strong>
              <span className="ms-2 text-muted small">({Math.min(usersVisible, totalUsers)} of {totalUsers})</span>
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
                        <th style={{ width: "22%" }}>Email</th>
                        <th style={{ width: "12%" }}>Role</th>
                        <th style={{ width: "6%" }} className="text-center">Active</th>
                        <th style={{ width: "10%" }} className="text-end">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleUsers.map((draftRow) => {
                        const orig = users.find((u) => u.id === draftRow.id)!;
                        const rowDirty = rowsDiffer(orig, draftRow);
                        const isSelf = me?.id && String(me.id) === String(draftRow.id);
                        const cannotDeleteSelf = Boolean(isSelf);

                        return (
                          <UserRowEditor
                            key={draftRow.id}
                            draft={draftRow}
                            onChange={(updated) => setUsersDraft((prev) => prev.map((u) => (u.id === draftRow.id ? updated : u)))}
                            saving={Boolean(userSaving) || bulkSaving}
                            onResetPassword={resetPassword}
                            onDeleteUser={deleteUser}
                            rowDirty={rowDirty}
                            canDelete={!cannotDeleteSelf}
                            disableRoleSelect={Boolean(isSelf)}   // ✅ prevents self demotion
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
      )}

      {/* Modules (admin only) */}
      {isAdmin && (
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

              <button className="btn btn-sm btn-primary" onClick={saveModules} disabled={modulesSaving || !modulesDirty}>
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
      )}

      {/* Legal & Policies */}
      <div className="card mb-4">
        <div className="card-header d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-file-text" aria-hidden="true" />
            <strong>Legal & Policies</strong>
          </div>
        </div>

        <div className="card-body">
          <div className="mb-2">
            <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => setShowTerms((v) => !v)}>
              {showTerms ? "Hide" : "Show"} Terms & Conditions
            </button>
            <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => setShowPrivacy((v) => !v)}>
              {showPrivacy ? "Hide" : "Show"} Privacy Notice
            </button>
            <button className="btn btn-sm btn-outline-secondary" onClick={() => setShowAuditNotice((v) => !v)}>
              {showAuditNotice ? "Hide" : "Show"} Audit & Monitoring
            </button>
          </div>

          {showTerms && (
            <div className="border rounded p-3 mb-2 bg-body-tertiary">
              <h6 className="mb-2">Terms & Conditions (Summary)</h6>
              <ul className="mb-0">
                <li>Use BridgePoint only for authorised operational purposes within your organisation.</li>
                <li>Do not attempt to access data outside your assigned environment/tenant.</li>
                <li>Do not share credentials; accounts are personal and auditable.</li>
                <li>BridgePoint features may change; changes are communicated via release notes.</li>
              </ul>
              <div className="text-muted small mt-2">Version: 0.1 • Update before customer rollout</div>
            </div>
          )}

          {showPrivacy && (
            <div className="border rounded p-3 mb-2 bg-body-tertiary">
              <h6 className="mb-2">Privacy Notice (Summary)</h6>
              <ul className="mb-0">
                <li>We process user identifiers (e.g., username/email) to authenticate and authorise access.</li>
                <li>We store audit logs (actions, timestamps, IP address, user agent) for security and compliance.</li>
                <li>Passwords are stored as hashes (not plaintext).</li>
                <li>Retention is controlled by organisational policy.</li>
              </ul>
            </div>
          )}

          {showAuditNotice && (
            <div className="border rounded p-3 bg-body-tertiary">
              <h6 className="mb-2">Audit & Monitoring</h6>
              <p className="mb-2">
                BridgePoint records security and operational audit events to provide traceability and support compliance.
                Events may include acting user, time, IP address, browser user agent, and action metadata.
              </p>
              <p className="mb-0 text-muted small">Attempted unauthorised actions may also be logged.</p>
            </div>
          )}

          <hr />
          <div className="text-muted small">
            © {new Date().getFullYear()} BridgePoint • Built for operational compliance and traceability.
          </div>
        </div>
      </div>
    </div>
  );
}

function UserRowEditor({
  draft,
  onChange,
  saving,
  onResetPassword,
  onDeleteUser,
  rowDirty,
  canDelete,
  disableRoleSelect,
}: {
  draft: UserRow;
  onChange: (row: UserRow) => void;
  saving: boolean;
  onResetPassword: (userId: string, newPassword: string) => Promise<boolean>;
  onDeleteUser: (userId: string) => Promise<void>;
  rowDirty: boolean;
  canDelete: boolean;
  disableRoleSelect: boolean;
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
        <td className="text-center" title={rowDirty ? "Unsaved changes" : ""}>
          {rowDirty ? <span className="d-inline-block rounded-circle bg-primary" style={{ width: 8, height: 8 }} /> : null}
        </td>

        <td>
          <input className="form-control form-control-sm" value={draft.username} onChange={(e) => onChange({ ...draft, username: e.target.value })} disabled={saving} />
        </td>
        <td>
          <input className="form-control form-control-sm" value={draft.firstName} onChange={(e) => onChange({ ...draft, firstName: e.target.value })} disabled={saving} />
        </td>
        <td>
          <input className="form-control form-control-sm" value={draft.lastName} onChange={(e) => onChange({ ...draft, lastName: e.target.value })} disabled={saving} />
        </td>
        <td>
          <input className="form-control form-control-sm" type="email" value={draft.email} onChange={(e) => onChange({ ...draft, email: e.target.value })} disabled={saving} />
        </td>

        <td>
          <select
            className="form-select form-select-sm"
            value={draft.role}
            onChange={(e) => onChange({ ...draft, role: e.target.value as UserRow["role"] })}
            disabled={saving || disableRoleSelect}
            title={disableRoleSelect ? "You cannot change your own role." : undefined}
          >
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          {disableRoleSelect ? <div className="text-muted small mt-1">You can’t change your own role.</div> : null}
        </td>

        <td className="text-center">
          <div className="form-check form-switch d-flex justify-content-center align-items-center m-0 p-0">
            <input className="form-check-input" type="checkbox" checked={draft.active} onChange={(e) => onChange({ ...draft, active: e.target.checked })} disabled={saving} />
          </div>
        </td>

        <td className="text-end">
          <div className="d-flex gap-2 justify-content-end">
            <button className="btn btn-sm btn-outline-danger" onClick={() => setShowReset(true)} disabled={saving}>
              <i className="bi bi-key" aria-hidden="true" /> Reset
            </button>

            <button className="btn btn-sm btn-danger" onClick={() => onDeleteUser(draft.id)} disabled={saving || !canDelete}>
              <i className="bi bi-trash" aria-hidden="true" /> Delete
            </button>
          </div>
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
                  <input type="password" className="form-control form-control-sm" value={pw1} onChange={(e) => setPw1(e.target.value)} disabled={resetting} />
                </div>
                <div className="col-md-4">
                  <label className="form-label form-label-sm">Confirm password</label>
                  <input type="password" className="form-control form-control-sm" value={pw2} onChange={(e) => setPw2(e.target.value)} disabled={resetting} />
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