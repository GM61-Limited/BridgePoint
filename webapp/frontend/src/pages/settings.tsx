
// src/pages/Settings.tsx
import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

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
  username: string;       // backend username (separate from names)
  firstName: string;      // mapped from backend first_name
  lastName: string;       // mapped from backend last_name
  email: string;
  role: "admin" | "editor" | "viewer"; // mapped from "Admin" | "Editor" | "Viewer"
  active: boolean;        // mapped from backend "is_active"
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

/** --- Settings page --- */
export default function Settings() {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [org, setOrg] = useState<Organization | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null);

  // Organization edit state
  const [orgEdit, setOrgEdit] = useState<OrgUpdate>({});
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgEditing, setOrgEditing] = useState(false);

  // Users edit state
  const [userSaving, setUserSaving] = useState<string | null>(null);
  const [userAdding, setUserAdding] = useState(false);

  // Connections (placeholder)
  const [summary, setSummary] = useState<ConnectionSummary | null>(PLACEHOLDER_SUMMARY);

  const baseHeaders = useMemo(() => authHeaders(token), [token]);

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

        /** 2) In parallel: users (scoped) and version */
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
            // Client-side safety filter until backend enforces tenant scoping
            const filtered = envId == null ? list : list.filter((u) => numericEnvId(u.environment_id) === envId);
            return filtered.map(normalizeUserRow);
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

        const [usersData, versionData] = await Promise.all([usersPromise, versionPromise]);

        if (!cancelled) {
          setOrg(orgData);
          setUsers(usersData);
          setAppInfo(versionData);

          // Connections placeholder — refresh lastUpdated so setter is used
          setSummary((prev) => {
            const base = prev ?? PLACEHOLDER_SUMMARY;
            return { ...base, lastUpdated: new Date().toISOString() };
          });

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

  /** --- Users: persist to backend (username/first_name/last_name/email/role/is_active) --- */
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
    } catch (err: any) {
      setError(err?.message ?? "Failed to update user.");
    } finally {
      setUserSaving(null);
    }
  }

  /** --- Users: reset password --- */
  async function resetPassword(userId: string, newPassword: string) {
    const envId = numericEnvId(org?.id);
    try {
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
    }
  }

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
          first_name: null,              // send null for optional fields (avoids EmailStr validation errors)
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
    } catch (err: any) {
      setError(err?.message ?? "Failed to create user.");
    } finally {
      setUserAdding(false);
    }
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
    <div className="container-xxl py-3 settings-page">{/* wider container */}
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
          </div>
          <button className="btn btn-sm btn-outline-primary" onClick={addUser} disabled={userAdding}>
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
        <div className="card-body" style={{ overflowX: "auto" }}>
          {users.length === 0 ? (
            <div className="text-muted">No users found.</div>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr>
                    <th style={{ width: "16%" }}>Username</th>
                    <th style={{ width: "16%" }}>First name</th>
                    <th style={{ width: "16%" }}>Last name</th>
                    <th style={{ width: "20%" }}>Email</th>
                    <th style={{ width: "12%" }}>Role</th>
                    <th style={{ width: "8%"  }}>Active</th>
                    <th style={{ width: "12%" }} className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <UserRowEditor
                      key={u.id}
                      row={u}
                      saving={userSaving === u.id}
                      onSave={updateUser}
                      onResetPassword={resetPassword}
                    />
                  ))}
                </tbody>
              </table>
            </div>
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
              <Stat title="Total"  value={summary.total}  icon="bi-diagram-3" />
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
  row,
  saving,
  onSave,
  onResetPassword,
}: {
  row: UserRow;
  saving: boolean;
  onSave: (row: UserRow) => Promise<void>;
  onResetPassword: (userId: string, newPassword: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<UserRow>(row);
  const [showReset, setShowReset] = useState(false);
  const [pw1, setPw1] = useState("");
  const [pw2, setPw2] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [resetOk, setResetOk] = useState<boolean>(false);

  const dirty =
    draft.username !== row.username ||
    draft.firstName !== row.firstName ||
    draft.lastName !== row.lastName ||
    draft.email !== row.email ||
    draft.role !== row.role ||
    draft.active !== row.active;

  useEffect(() => setDraft(row), [row]);

  async function handleConfirmReset() {
    setResetErr(null);
    setResetOk(false);
    if (!pw1) { setResetErr("Password is required."); return; }
    if (pw1 !== pw2) { setResetErr("Passwords do not match."); return; }

    setResetting(true);
    const ok = await onResetPassword(row.id, pw1);
    setResetting(false);
    if (ok) {
      setResetOk(true);
      setPw1("");
      setPw2("");
      // auto-close after a brief success cue
      setTimeout(() => { setShowReset(false); setResetOk(false); }, 900);
    } else {
      setResetErr("Failed to reset password.");
    }
  }

  return (
    <>
      <tr>
        <td>
          <input
            className="form-control form-control-sm"
            value={draft.username}
            onChange={(e) => setDraft((d) => ({ ...d, username: e.target.value }))}
            disabled={saving}
          />
        </td>
        <td>
          <input
            className="form-control form-control-sm"
            value={draft.firstName}
            onChange={(e) => setDraft((d) => ({ ...d, firstName: e.target.value }))}
            disabled={saving}
          />
        </td>
        <td>
          <input
            className="form-control form-control-sm"
            value={draft.lastName}
            onChange={(e) => setDraft((d) => ({ ...d, lastName: e.target.value }))}
            disabled={saving}
          />
        </td>
        <td>
          <input
            className="form-control form-control-sm"
            type="email"
            value={draft.email}
            onChange={(e) => setDraft((d) => ({ ...d, email: e.target.value }))}
            disabled={saving}
          />
        </td>
        <td>
          <select
            className="form-select form-select-sm"
            value={draft.role}
            onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value as UserRow["role"] }))}
            disabled={saving}
          >
            <option value="admin">Admin</option>
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
        </td>
        <td>
          <div className="form-check form-switch">
            <input
              className="form-check-input"
              type="checkbox"
              checked={draft.active}
              onChange={(e) => setDraft((d) => ({ ...d, active: e.target.checked }))}
              disabled={saving}
              id={`active-${row.id}`}
            />
            <label className="form-check-label" htmlFor={`active-${row.id}`}>
              {draft.active ? "Enabled" : "Disabled"}
            </label>
          </div>
        </td>

        {/* Actions: wider buttons that wrap if needed */}
        <td className="text-end">
          <div className="d-flex justify-content-end flex-wrap gap-2">
            <button
              className="btn btn-outline-secondary"
              onClick={() => setDraft(row)}
              disabled={saving || !dirty}
              title="Reset changes"
            >
              <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
            </button>

            <button
              className="btn btn-outline-danger"
              onClick={() => setShowReset(true)}
              disabled={saving}
              title="Reset password"
            >
              <i className="bi bi-key" aria-hidden="true" /> Reset
            </button>

            <button
              className="btn btn-primary"
              onClick={() => onSave(draft)}
              disabled={saving || !dirty}
              title="Save changes"
            >
              {saving ? (
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
        </td>
      </tr>

      {/* Inline reset panel */}
      {showReset && (
        <tr>
          <td colSpan={7}>
            <div className="border rounded p-3 bg-light">
              <div className="d-flex justify-content-between align-items-center mb-2">
                <strong>Reset password for <code>{row.username}</code></strong>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  onClick={() => { setShowReset(false); setResetErr(null); setResetOk(false); }}
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
                  <button
                    className="btn btn-danger"
                    onClick={handleConfirmReset}
                    disabled={resetting}
                  >
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
