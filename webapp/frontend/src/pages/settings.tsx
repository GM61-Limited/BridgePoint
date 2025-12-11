
// src/pages/Settings.tsx
import React, { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

/** --- API base (used for organization only, users/connections are placeholders) --- */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/** --- Types --- */
export type Organization = {
  id: string;
  name: string;
  domain: string;
  address?: string;
  timezone?: string;
};

export type OrgUpdate = Partial<Pick<Organization, "name" | "domain" | "address" | "timezone">>;

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "editor" | "viewer";
  active: boolean;
};

export type ConnectionSummary = {
  total: number;
  active: number;
  failed: number;
  lastUpdated?: string;
};

/** --- Placeholder data (keep users + connections local for now) --- */
const PLACEHOLDER_ORG: Organization = {
  id: "org-1",
  name: "Your Organization",
  domain: "example.org",
  address: "123 Example Street, Example City",
  timezone: "Europe/London",
};

const PLACEHOLDER_USERS: UserRow[] = [
  { id: "u-1", name: "Nick LeMasonry",    email: "nick@example.org",    role: "admin",  active: true },
  { id: "u-2", name: "Gill LeMasonry",    email: "gill@example.org",    role: "editor", active: true },
  { id: "u-3", name: "Matthew LeMasonry", email: "matthew@example.org", role: "viewer", active: true },
];

const PLACEHOLDER_SUMMARY: ConnectionSummary = {
  total: 5,
  active: 4,
  failed: 1,
  lastUpdated: new Date().toISOString(),
};

/** --- Helpers --- */
function authHeaders(token: string | null) {
  const h: Record<string, string> = { "Content-Type": "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function safeErrMsg(res: Response) {
  try {
    const data = await res.json();
    return data?.message || data?.error || data?.detail || `${res.status} ${res.statusText}`;
  } catch {
    return `${res.status} ${res.statusText}`;
  }
}

/** --- Settings page (renders inside Layout’s <Outlet/>) --- */
export default function Settings() {
  const { token } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [org, setOrg] = useState<Organization | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [summary, setSummary] = useState<ConnectionSummary | null>(null);

  // Organization edit state
  const [orgEdit, setOrgEdit] = useState<OrgUpdate>({});
  const [orgSaving, setOrgSaving] = useState(false);
  const [orgEditing, setOrgEditing] = useState(false);

  // Users edit state (local only)
  const [userSaving, setUserSaving] = useState<string | null>(null);
  const [userAdding, setUserAdding] = useState(false);

  const headers = useMemo(() => authHeaders(token), [token]);

  /** Bootstrap:
   * - Fetch Environement from backend (GET /environment)
   * - Use placeholders for Users & Connections
   */
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // ---- Environement from backend ----
        let orgData: Organization = PLACEHOLDER_ORG;
        try {
          const res = await fetch(`${API_BASE}/environment`, { headers });
          if (res.ok) {
            orgData = await res.json();
          } else {
            // Soft-fail to placeholder; surface message but don't block the page
            const msg = await safeErrMsg(res);
            console.warn("GET /environment failed:", msg);
          }
        } catch (e: any) {
          console.warn("GET /environment error:", e?.message ?? e);
        }

        // ---- Users + Connections from placeholders (no backend yet) ----
        const usersData: UserRow[] = PLACEHOLDER_USERS;
        const connData: ConnectionSummary = PLACEHOLDER_SUMMARY;

        if (!cancelled) {
          setOrg(orgData);
          setUsers(usersData);
          setSummary(connData);
          setOrgEdit({});
        }
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Failed to load settings.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [headers]);

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
      // Try backend PATCH first
      const res = await fetch(`${API_BASE}/environment`, {
        method: "PATCH",
        headers,
        body: JSON.stringify(orgEdit),
      });
      if (!res.ok) {
        const msg = await safeErrMsg(res);
        throw new Error(msg);
      }
      const updated: Organization = await res.json();
      setOrg(updated);
      setOrgEditing(false);
      setOrgEdit({});
    } catch (err: any) {
      // Fallback: optimistic local update if backend not ready
      setOrg((prev) => (prev ? { ...prev, ...orgEdit } : prev));
      setOrgEditing(false);
      setOrgEdit({});
      setError(err?.message ?? "Saved locally. Backend update not available yet.");
    } finally {
      setOrgSaving(false);
    }
  }

  /** --- Users editing (local only) --- */
  async function updateUser(row: UserRow) {
    setUserSaving(row.id);
    setError(null);
    try {
      // Local update only
      setUsers((prev) => prev.map((u) => (u.id === row.id ? row : u)));
    } catch (err: any) {
      setError(err?.message ?? "Failed to update user.");
    } finally {
      setUserSaving(null);
    }
  }

  async function addUser() {
    setUserAdding(true);
    setError(null);
    try {
      // Local insertion only
      const tempId = `u-${Date.now()}`;
      const created: UserRow = {
        id: tempId,
        name: "New User",
        email: `user${Date.now()}@${org?.domain ?? "example.org"}`,
        role: "viewer",
        active: true,
      };
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
      <div className="container py-4">
        <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "40vh" }}>
          <div className="spinner-border" role="status" aria-label="Loading" />
        </div>
      </div>
    );
  }

  return (
    <div className="container py-3 settings-page">
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

      {/* Organization card */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-buildings" aria-hidden="true" />
            <strong>Organization</strong>
          </div>
          {!orgEditing ? (
            <button className="btn btn-sm btn-outline-primary" onClick={startOrgEdit}>
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
                  value={orgEditing ? orgEdit.address ?? "" : org.address ?? ""}
                  onChange={(e) => setOrgEdit((p) => ({ ...p, address: e.target.value }))}
                  disabled={!orgEditing}
                />
              </div>
              <div className="col-md-4">
                <label className="form-label">Timezone</label>
                <input
                  className="form-control"
                  value={orgEditing ? orgEdit.timezone ?? "" : org.timezone ?? ""}
                  onChange={(e) => setOrgEdit((p) => ({ ...p, timezone: e.target.value }))}
                  disabled={!orgEditing}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Users card (placeholder/local) */}
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
        <div className="card-body">
          {users.length === 0 ? (
            <div className="text-muted">No users found.</div>
          ) : (
            <div className="table-responsive">
              <table className="table align-middle">
                <thead>
                  <tr>
                    <th style={{ width: "22%" }}>Name</th>
                    <th style={{ width: "28%" }}>Email</th>
                    <th style={{ width: "18%" }}>Role</th>
                    <th style={{ width: "12%" }}>Active</th>
                    <th style={{ width: "20%" }} className="text-end">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <UserRowEditor
                      key={u.id}
                      row={u}
                      saving={userSaving === u.id}
                      onSave={updateUser}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Connections summary (placeholder/local) */}
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

/** --- Row editor component (users; local only) --- */
function UserRowEditor({
  row,
  saving,
  onSave,
}: {
  row: UserRow;
  saving: boolean;
  onSave: (row: UserRow) => Promise<void>;
}) {
  const [draft, setDraft] = useState<UserRow>(row);
  const dirty =
    draft.name !== row.name ||
    draft.email !== row.email ||
    draft.role !== row.role ||
    draft.active !== row.active;

  useEffect(() => setDraft(row), [row]);

  return (
    <tr>
      <td>
        <input
          className="form-control form-control-sm"
          value={draft.name}
          onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
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
      <td className="text-end">
        <button
          className="btn btn-sm btn-outline-secondary me-2"
          onClick={() => setDraft(row)}
          disabled={saving || !dirty}
          title="Reset changes"
        >
          <i className="bi bi-arrow-counterclockwise" aria-hidden="true" />
        </button>
        <button
          className="btn btn-sm btn-primary"
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
      </td>
    </tr>
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
