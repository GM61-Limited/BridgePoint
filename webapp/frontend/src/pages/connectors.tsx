
// src/pages/connectors.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { api, listSqlConnections, runSqlSelect, testSqlConnection } from "../lib/api";

/* =========================================================================
   Types
   ========================================================================= */
type Env = "Prod" | "Test";
type Status = "connected" | "connecting" | "disconnected" | "error";
type AuthType = "apiKey" | "oauth2" | "basic" | "custom";
type Category = "api" | "database";

type ApiProvider = "Assure" | "TDOC" | "HealthEdge" | "Sage Intacct" | "Xero";
type DbProvider = "PostgreSQL" | "MySQL" | "Microsoft SQL Server" | "Azure SQL";

type BaseConnector = {
  id: string;
  name: string;
  category: Category;
  env: Env;
  enabled: boolean;
  status: Status;
  lastSyncAt?: string | null;
  nextSyncAt?: string | null;
  notes?: string;
  logoUrl?: string; // optional: place images under /public/images/...
};

type ApiConnector = BaseConnector & {
  category: "api";
  provider: ApiProvider;
  baseUrl?: string;
  authType: AuthType;
  maskedKey?: string;     // "•••••abcd"
  clientId?: string;
  tenant?: string;
};

type DbConnector = BaseConnector & {
  category: "database";
  provider: DbProvider;
  host?: string;
  port?: number;
  dbName?: string;
  userMasked?: string;     // "svc_bridgepoint"
  ssl?: boolean;
  // backend id for sql_connections (if present, use live endpoints)
  sqlId?: number;
};

type AnyConnector = ApiConnector | DbConnector;

/* =========================================================================
   Helpers & allowed provider lists
   ========================================================================= */
const nowIso = () => new Date().toISOString();
const inMinutes = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();
const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function statusChip(status: Status) {
  const map: Record<Status, { text: string; className: string; icon: string }> = {
    connected:   { text: "Connected",   className: "text-success", icon: "bi-check-circle" },
    connecting:  { text: "Connecting…", className: "text-warning", icon: "bi-arrow-repeat" },
    disconnected:{ text: "Disconnected",className: "text-muted",   icon: "bi-slash-circle" },
    error:       { text: "Error",       className: "text-danger",  icon: "bi-exclamation-triangle" },
  };
  return map[status];
}

// Allowed providers (your defined set)
const ALLOWED_API: ApiProvider[] = ["Assure", "TDOC", "HealthEdge", "Sage Intacct", "Xero"];
const ALLOWED_DB: DbProvider[]  = ["PostgreSQL", "MySQL", "Microsoft SQL Server", "Azure SQL"];

/* =========================================================================
   Page
   ========================================================================= */
export default function Connectors() {
  // Live-only: start empty and load from backend
  const [connectors, setConnectors] = useState<AnyConnector[]>([]);
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AnyConnector | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());
  const [error, setError] = useState<string | null>(null);

  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Env/tenant selection — TODO: derive from logged-in user
  const ENV_ID = 2; // GM61 Limited in your seed

  // 1s tick for "Last updated"
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Load DB connections from backend (no demo seeds)
  async function refreshDbConnections() {
    try {
      const rows = await listSqlConnections(ENV_ID);
      const serverDbCards: DbConnector[] = rows.map((r) => ({
        id: `db-sql-${r.id}`,
        name: r.name || "PostgreSQL",
        category: "database",
        provider: "PostgreSQL",
        env: "Prod",
        enabled: true,
        status: "disconnected",      // updated via Test/Sync
        host: r.host,
        port: r.port,
        dbName: r.database_name,
        userMasked: r.username,      // safe to display
        ssl: false,                  // set true once schema includes ssl
        lastSyncAt: null,
        nextSyncAt: null,
        notes: "From backend (sql_connections).",
        logoUrl: "/images/postgres.png",
        sqlId: r.id,                 // backend id to call
      }));
      // We only show live data: DB from backend. (APIs can be added when backend route exists.)
      setConnectors(serverDbCards);
    } catch (err: any) {
      // eslint-disable-next-line no-console
      console.error("[connectors] failed to load sql_connections:", err);
      setError(err?.message || "Failed to load database connections.");
    }
  }

  useEffect(() => {
    refreshDbConnections();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return connectors.filter(c => {
      if (filter !== "all" && c.category !== filter) return false;
      if (!q) return true;
      const hay = (c.name + " " + ("provider" in c ? (c as any).provider : "") + " " + c.env + " " + (c.notes ?? "")).toLowerCase();
      return hay.includes(q);
    });
  }, [connectors, filter, query]);

  const apis = filtered.filter(c => c.category === "api") as ApiConnector[];
  const dbs  = filtered.filter(c => c.category === "database") as DbConnector[];

  /* ---- actions ---- */
  function updateConnector(updated: AnyConnector) {
    setConnectors(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  }

  // DB cards with sqlId call backend; APIs currently disabled until backend route exists
  function testConnection(c: AnyConnector) {
    if (c.category === "database" && (c as DbConnector).sqlId) {
      const sqlId = (c as DbConnector).sqlId!;
      const testing = { ...c, status: "connecting" as Status };
      updateConnector(testing);

      testSqlConnection(sqlId)
        .then((res) => {
          const ok = res.ok;
          updateConnector({
            ...testing,
            status: ok ? "connected" : "error",
            lastSyncAt: ok ? nowIso() : c.lastSyncAt ?? null,
            nextSyncAt: ok ? inMinutes(10) : null,
            notes: ok ? c.notes : (c.notes ?? "") + (res.error ? ` • ${res.error}` : ""),
          });
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[connectors] test failed:", err);
          updateConnector({ ...testing, status: "error", nextSyncAt: null });
        });
      return;
    }

    // For API connectors, we can show a toast or no-op until backend API is ready.
    setError("Testing API connectors will be available once the backend route is added.");
  }

  function syncNow(c: AnyConnector) {
    if (c.category === "database" && (c as DbConnector).sqlId) {
      const sqlId = (c as DbConnector).sqlId!;
      updateConnector({ ...c, status: "connecting" });

      runSqlSelect(sqlId, "SELECT version() AS pg_version, CURRENT_TIMESTAMP AS now")
        .then((res) => {
          updateConnector({
            ...c,
            status: "connected",
            lastSyncAt: nowIso(),
            nextSyncAt: inMinutes(15),
            notes: `${c.notes ?? ""}${c.notes ? " • " : ""}Last sync ok (${res.count} row${res.count === 1 ? "" : "s"})`,
          });
        })
        .catch((err) => {
          // eslint-disable-next-line no-console
          console.error("[connectors] sync failed:", err);
          updateConnector({ ...c, status: "error", nextSyncAt: null, notes: (c.notes ?? "") + " • Sync failed" });
        });
      return;
    }

    setError("Sync for API connectors will be available once the backend route is added.");
  }

  function toggleEnabled(c: AnyConnector) {
    updateConnector({
      ...c,
      enabled: !c.enabled,
      status: !c.enabled ? "connecting" : "disconnected",
      nextSyncAt: !c.enabled ? inMinutes(10) : null,
    });
  }

  function disconnect(c: AnyConnector) {
    updateConnector({ ...c, status: "disconnected", nextSyncAt: null });
  }

  /* ---- add connection ---- */
  function openAddModal() {
    setShowAddModal(true);
  }
  function closeAddModal() {
    setShowAddModal(false);
  }

  async function createDbConnection(draft: NewConnectionDraft) {
    try {
      const payload = {
        environment_id: ENV_ID,
        name: draft.name,
        host: draft.host,
        database_name: draft.dbName,
        port: Number(draft.port || 5432),
        table_name: draft.tableName || null,
        username: draft.username,
        password: draft.password,
      };
      // Backend route:
      // POST /api/v1/sql-connections -> inserts into sql_connections
      await api.post("/v1/sql-connections", payload);
      await refreshDbConnections();
      closeAddModal();
    } catch (err: any) {
      setError(err?.message || "Failed to create database connection.");
    }
  }

  async function createApiConnection(_draft: NewConnectionDraft) {
    // Optional: wire when backend route exists
    setError("Creating API connections will be available once the backend route is added.");
  }

  /* ---- render ---- */
  return (
    <div className="container-xxl py-3">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Connectors</h2>
        <div className="d-flex align-items-center gap-2">
          <button className="btn btn-sm btn-outline-primary" onClick={openAddModal}>
            <i className="bi bi-plus-circle" /> Add connection
          </button>
          <div className="text-muted small">Last refresh: {new Date(nowTick).toLocaleTimeString()}</div>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger" role="alert">
          <i className="bi bi-exclamation-triangle" /> {error}
        </div>
      )}

      {/* toolbar */}
      <div className="card mb-3">
        <div className="card-header d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <i className="bi bi-plug" aria-hidden="true" />
            <strong>Integration endpoints</strong>
          </div>
          <div className="d-flex flex-wrap gap-2">
            <div className="btn-group btn-group-sm" role="group" aria-label="Filter by category">
              <button className={`btn btn-outline-primary ${filter === "all" ? "active" : ""}`} onClick={() => setFilter("all")}>All</button>
              <button className={`btn btn-outline-primary ${filter === "api" ? "active" : ""}`} onClick={() => setFilter("api")}>APIs</button>
              <button className={`btn btn-outline-primary ${filter === "database" ? "active" : ""}`} onClick={() => setFilter("database")}>Databases</button>
            </div>

            <div className="input-group input-group-sm" style={{ minWidth: 260 }}>
              <span className="input-group-text"><i className="bi bi-search" /></span>
              <input className="form-control" placeholder="Search name/provider…" value={query} onChange={e => setQuery(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="card-body">
          {/* legend */}
          <div className="small text-muted mb-3 d-flex flex-wrap gap-3">
            <span><i className="bi bi-check-circle text-success" /> Connected</span>
            <span><i className="bi bi-arrow-repeat text-warning" /> Connecting</span>
            <span><i className="bi bi-slash-circle text-muted" /> Disconnected</span>
            <span><i className="bi bi-exclamation-triangle text-danger" /> Error</span>
          </div>

          {/* APIs */}
          <section className="mb-4">
            <h5 className="mb-2 d-flex align-items-center gap-2"><i className="bi bi-cloud" /> APIs</h5>
            {apis.length === 0 ? (
              <div className="text-muted">No API connectors yet.</div>
            ) : (
              <div className="row g-3">
                {apis.map(c => (
                  <ConnectorCard
                    key={c.id}
                    conn={c}
                    onEdit={() => setSelected(c)}
                    onTest={testConnection}
                    onToggle={toggleEnabled}
                    onSync={syncNow}
                    onDisconnect={disconnect}
                  />
                ))}
              </div>
            )}
          </section>

          {/* DBs */}
          <section>
            <h5 className="mb-2 d-flex align-items-center gap-2"><i className="bi bi-database" /> Databases</h5>
            {dbs.length === 0 ? (
              <div className="text-muted">No database connectors yet.</div>
            ) : (
              <div className="row g-3">
                {dbs.map(c => (
                  <ConnectorCard
                    key={c.id}
                    conn={c}
                    onEdit={() => setSelected(c)}
                    onTest={testConnection}
                    onToggle={toggleEnabled}
                    onSync={syncNow}
                    onDisconnect={disconnect}
                  />
                ))}
              </div>
            )}
          </section>

          <div className="text-muted small mt-3">
            Showing <strong>live</strong> connections from the backend. API creation/listing will appear once the API endpoints are available.
          </div>
        </div>
      </div>

      {/* Edit modal (existing) */}
      {selected && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100 bg-black bg-opacity-25"
            style={{ zIndex: 1049 }}
            onClick={() => setSelected(null)}
            aria-hidden="true"
          />
          <EditConnectorModal
            value={selected}
            onClose={() => setSelected(null)}
            onSave={(v) => { updateConnector(v); setSelected(null); }}
          />
        </>
      )}

      {/* Add connection modal (new) */}
      {showAddModal && (
        <>
          <div
            className="position-fixed top-0 start-0 w-100 h-100 bg-black bg-opacity-25"
            style={{ zIndex: 1049 }}
            onClick={closeAddModal}
            aria-hidden="true"
          />
          <AddConnectionModal
            allowedApi={ALLOWED_API}
            allowedDb={ALLOWED_DB}
            onClose={closeAddModal}
            onCreateDb={createDbConnection}
            onCreateApi={createApiConnection}
          />
        </>
      )}
    </div>
  );
}

/* =========================================================================
   Card
   ========================================================================= */
function ConnectorCard({
  conn,
  onEdit,
  onTest,
  onToggle,
  onSync,
  onDisconnect,
}: {
  conn: AnyConnector;
  onEdit: () => void;
  onTest: (c: AnyConnector) => void;
  onToggle: (c: AnyConnector) => void;
  onSync: (c: AnyConnector) => void;
  onDisconnect: (c: AnyConnector) => void;
}) {
  const chip = statusChip(conn.status);
  const isApi = conn.category === "api";

  return (
    <div className="col-12 col-md-6 col-lg-4">
      <div
        className="border rounded p-3 h-100 d-flex flex-column"
        style={{ backgroundColor: "var(--bs-body-bg)", borderColor: "var(--bs-border-color)" }}
      >
        {/* header */}
        <div className="d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <Logo logoUrl={conn.logoUrl} fallbackIcon={isApi ? "bi-cloud" : "bi-database"} />
            <div>
              <div className="fw-semibold">{conn.name}</div>
              <div className="text-muted small">{conn.env} · {isApi ? "API" : "Database"}</div>
            </div>
          </div>
          <div className={`d-flex align-items-center gap-1 ${chip.className}`} title={chip.text}>
            <i className={`bi ${chip.icon}`} /> <span className="small">{chip.text}</span>
            {/* Optional indicator for live DB cards */}
            {conn.category === "database" && (conn as DbConnector).sqlId && (
              <span className="badge text-bg-secondary ms-2" title="Live backend">🔌</span>
            )}
          </div>
        </div>

        {/* content */}
        <div className="mt-2 small" style={{ color: "var(--bs-secondary-color)" }}>
          {isApi ? (
            <ApiMini c={conn as ApiConnector} />
          ) : (
            <DbMini c={conn as DbConnector} />
          )}
          <div className="mt-2">
            <span className="me-3">Last sync: {fmtTime(conn.lastSyncAt)}</span>
            <span>Next sync: {fmtTime(conn.nextSyncAt)}</span>
          </div>
          {conn.notes && <div className="mt-2">{conn.notes}</div>}
        </div>

        {/* actions */}
        <div className="mt-auto pt-3 d-flex flex-wrap gap-2 justify-content-between">
          <div className="btn-group btn-group-sm">
            <button
              className={`btn ${conn.enabled ? "btn-outline-secondary" : "btn-outline-primary"}`}
              onClick={() => onToggle(conn)}
            >
              {conn.enabled ? "Disable" : "Enable"}
            </button>
            {conn.status === "connected" ? (
              <button className="btn btn-outline-secondary" onClick={() => onDisconnect(conn)}>Disconnect</button>
            ) : (
              <button className="btn btn-outline-secondary" onClick={() => onTest(conn)}>
                <i className="bi bi-wifi" /> Test
              </button>
            )}
          </div>
          <div className="btn-group btn-group-sm">
            <button className="btn btn-outline-secondary" onClick={() => onEdit()}><i className="bi bi-gear" /> Edit</button>
            <button className="btn btn-outline-primary" onClick={() => onSync(conn)}>
              <i className="bi bi-cloud-arrow-down" /> Sync now
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Logo({ logoUrl, fallbackIcon }: { logoUrl?: string; fallbackIcon: string }) {
  const size = 32;
  if (logoUrl) {
    return <img src={logoUrl} alt="" width={size} height={size} style={{ objectFit: "contain" }} />;
  }
  return (
    <div
      className="d-inline-flex align-items-center justify-content-center rounded"
      style={{ width: size, height: size, background: "var(--bs-tertiary-bg)", border: "1px solid var(--bs-border-color)" }}
    >
      <i className={`bi ${fallbackIcon}`} />
    </div>
  );
}

function ApiMini({ c }: { c: ApiConnector }) {
  return (
    <div>
      <div><strong>Base URL:</strong> <span className="text-break">{c.baseUrl ?? "—"}</span></div>
      <div><strong>Auth:</strong> {c.authType} {c.maskedKey ? `· ${c.maskedKey}` : ""}</div>
    </div>
  );
}

function DbMini({ c }: { c: DbConnector }) {
  return (
    <div>
      <div><strong>Server:</strong> {c.host ?? "—"}{c.port ? `:${c.port}` : ""}</div>
      <div><strong>Database:</strong> {c.dbName ?? "—"} · <strong>User:</strong> {c.userMasked ?? "—"} {c.ssl ? "· SSL" : ""}</div>
    </div>
  );
}

/* =========================================================================
   Add Connection Modal (new)
   ========================================================================= */
type NewConnectionDraft = {
  category: Category;
  provider: ApiProvider | DbProvider | "";
  name: string;
  env: Env; // currently display-only; envId used to persist
  // DB fields
  host?: string;
  port?: number | string;
  dbName?: string;
  tableName?: string;
  username?: string;
  password?: string;
  // API fields (future)
  baseUrl?: string;
  apiKey?: string;
  apiSecret?: string;
  authType?: AuthType;
};

function AddConnectionModal({
  allowedApi,
  allowedDb,
  onClose,
  onCreateDb,
  onCreateApi,
}: {
  allowedApi: ApiProvider[];
  allowedDb: DbProvider[];
  onClose: () => void;
  onCreateDb: (draft: NewConnectionDraft) => Promise<void> | void;
  onCreateApi: (draft: NewConnectionDraft) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<NewConnectionDraft>({
    category: "database",
    provider: "",
    name: "",
    env: "Prod",
    host: "",
    port: 5432,
    dbName: "",
    tableName: "",
    username: "",
    password: "",
  });

  const isDb = draft.category === "database";
  const isApi = draft.category === "api";

  function field<K extends keyof NewConnectionDraft>(k: K, v: NewConnectionDraft[K]) {
    setDraft(prev => ({ ...prev, [k]: v }));
  }

  async function handleSave() {
    if (!draft.name) return alert("Please enter a display name.");
    if (!draft.provider) return alert("Please select a provider.");
    if (isDb) {
      if (!draft.host || !draft.dbName || !draft.username || !draft.password) {
        return alert("Please enter host, database, username, and password.");
      }
      await onCreateDb(draft);
      return;
    }
    if (isApi) {
      if (!draft.baseUrl) return alert("Please enter base URL.");
      await onCreateApi(draft);
    }
  }

  return (
    <div
      className="position-fixed top-50 start-50 translate-middle shadow border rounded"
      role="dialog"
      aria-modal="true"
      aria-label="Add connection"
      style={{
        zIndex: 1050,
        width: 780,
        maxWidth: "95vw",
        backgroundColor: "var(--bs-body-bg)",
        color: "var(--bs-body-color)",
        borderColor: "var(--bs-border-color)",
      }}
    >
      <div className="border-bottom p-3 d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-plus-circle" /> <strong>Add connection</strong>
        </div>
        <button className="btn btn-sm btn-outline-secondary" onClick={onClose}>
          <i className="bi bi-x-lg" /> Close
        </button>
      </div>

      <div className="p-3">
        <div className="row g-3">
          <div className="col-md-4">
            <label className="form-label">Category</label>
            <select
              className="form-select"
              value={draft.category}
              onChange={e => field("category", e.target.value as Category)}
            >
              <option value="database">Database</option>
              <option value="api">API</option>
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Provider</label>
            <select
              className="form-select"
              value={draft.provider || ""}
              onChange={e => field("provider", e.target.value as any)}
            >
              <option value="">— Select —</option>
              {(draft.category === "database" ? allowedDb : allowedApi).map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>
          <div className="col-md-4">
            <label className="form-label">Display name</label>
            <input className="form-control" value={draft.name} onChange={e => field("name", e.target.value)} />
          </div>

          {isDb && (
            <>
              <div className="col-md-7">
                <label className="form-label">Server / Host</label>
                <input className="form-control" value={draft.host} onChange={e => field("host", e.target.value)} />
              </div>
              <div className="col-md-2">
                <label className="form-label">Port</label>
                <input type="number" className="form-control" value={draft.port ?? 5432} onChange={e => field("port", Number(e.target.value))} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Database</label>
                <input className="form-control" value={draft.dbName} onChange={e => field("dbName", e.target.value)} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Username</label>
                <input className="form-control" value={draft.username} onChange={e => field("username", e.target.value)} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Password</label>
                <input type="password" className="form-control" value={draft.password} onChange={e => field("password", e.target.value)} />
              </div>
              <div className="col-md-12">
                <label className="form-label">Default table (optional)</label>
                <input className="form-control" value={draft.tableName ?? ""} onChange={e => field("tableName", e.target.value)} />
              </div>
            </>
          )}

          {isApi && (
            <>
              <div className="col-12">
                <label className="form-label">Base URL</label>
                <input className="form-control" value={draft.baseUrl ?? ""} onChange={e => field("baseUrl", e.target.value)} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Auth type</label>
                <select
                  className="form-select"
                  value={draft.authType ?? "apiKey"}
                  onChange={e => field("authType", e.target.value as AuthType)}
                >
                  <option value="apiKey">API Key</option>
                  <option value="oauth2">OAuth 2.0</option>
                  <option value="basic">Basic</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">API key / client id</label>
                <input className="form-control" value={draft.apiKey ?? ""} onChange={e => field("apiKey", e.target.value)} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Secret / client secret</label>
                <input className="form-control" value={draft.apiSecret ?? ""} onChange={e => field("apiSecret", e.target.value)} />
              </div>
              <div className="col-md-6 d-flex align-items-end">
                <div className="text-muted small">Creation of API connectors will persist when backend route is available.</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="border-top p-3 d-flex justify-content-between">
        <div className="text-muted small">
          Provide connection details. Passwords are never shown back in the UI.
        </div>
        <div className="btn-group">
          <button className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>
            <i className="bi bi-save" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}

/* =========================================================================
   Edit Modal (existing)
   ========================================================================= */
function EditConnectorModal({
  value,
  onClose,
  onSave,
}: {
  value: AnyConnector;
  onClose: () => void;
  onSave: (v: AnyConnector) => void;
}) {
  const [draft, setDraft] = useState<AnyConnector>({ ...value });
  const closeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => { closeRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isApi = draft.category === "api";
  function field<K extends keyof AnyConnector>(k: K, v: AnyConnector[K]) {
    setDraft(prev => ({ ...prev, [k]: v }));
  }

  return (
    <div
      className="position-fixed top-50 start-50 translate-middle shadow border rounded"
      role="dialog"
      aria-modal="true"
      aria-label={`Edit ${draft.name}`}
      style={{
        zIndex: 1050,
        width: 720,
        maxWidth: "95vw",
        backgroundColor: "var(--bs-body-bg)",
        color: "var(--bs-body-color)",
        borderColor: "var(--bs-border-color)",
      }}
    >
      <div className="border-bottom p-3 d-flex align-items-center justify-content-between">
        <div className="d-flex align-items-center gap-2">
          <i className="bi bi-gear" /> <strong>Edit {draft.name}</strong>
          <span className="badge text-bg-secondary ms-2">{draft.env}</span>
        </div>
        <button ref={closeRef} className="btn btn-sm btn-outline-secondary" onClick={onClose}>
          <i className="bi bi-x-lg" /> Close
        </button>
      </div>

      <div className="p-3">
        {/* common fields */}
        <div className="row g-3">
          <div className="col-md-6">
            <label className="form-label">Display name</label>
            <input className="form-control" value={draft.name} onChange={e => field("name", e.target.value)} />
          </div>
          <div className="col-md-3">
            <label className="form-label">Environment</label>
            <select className="form-select" value={draft.env} onChange={e => field("env", e.target.value as Env)}>
              <option>Prod</option><option>Test</option>
            </select>
          </div>
          <div className="col-md-3 d-flex align-items-end">
            <div className="form-check form-switch">
              <input id="edit-enabled" className="form-check-input" type="checkbox" checked={draft.enabled} onChange={e => field("enabled", e.target.checked)} />
              <label htmlFor="edit-enabled" className="form-check-label">Enabled</label>
            </div>
          </div>

          {/* category-specific */}
          {isApi ? (
            <>
              <div className="col-12">
                <label className="form-label">Base URL</label>
                <input className="form-control" value={(draft as ApiConnector).baseUrl ?? ""} onChange={e => setDraft(prev => ({ ...(prev as ApiConnector), baseUrl: e.target.value }))} />
              </div>
              <div className="col-md-6">
                <label className="form-label">Auth type</label>
                <select
                  className="form-select"
                  value={(draft as ApiConnector).authType}
                  onChange={e => setDraft(prev => ({ ...(prev as ApiConnector), authType: e.target.value as AuthType }))}
                >
                  <option value="apiKey">API Key</option>
                  <option value="oauth2">OAuth 2.0</option>
                  <option value="basic">Basic</option>
                  <option value="custom">Custom</option>
                </select>
              </div>
              <div className="col-md-6">
                <label className="form-label">Masked secret / key</label>
                <input
                  className="form-control"
                  placeholder="••••••••••"
                  value={(draft as ApiConnector).maskedKey ?? ""}
                  onChange={e => setDraft(prev => ({ ...(prev as ApiConnector), maskedKey: e.target.value }))}
                />
              </div>
            </>
          ) : (
            <>
              <div className="col-md-7">
                <label className="form-label">Server / Host</label>
                <input className="form-control" value={(draft as DbConnector).host ?? ""} onChange={e => setDraft(prev => ({ ...(prev as DbConnector), host: e.target.value }))} />
              </div>
              <div className="col-md-2">
                <label className="form-label">Port</label>
                <input type="number" className="form-control" value={(draft as DbConnector).port ?? 0} onChange={e => setDraft(prev => ({ ...(prev as DbConnector), port: Number(e.target.value) }))} />
              </div>
              <div className="col-md-3">
                <label className="form-label">Database</label>
                <input className="form-control" value={(draft as DbConnector).dbName ?? ""} onChange={e => setDraft(prev => ({ ...(prev as DbConnector), dbName: e.target.value }))} />
              </div>
              <div className="col-md-6">
                <label className="form-label">User (masked)</label>
                <input className="form-control" value={(draft as DbConnector).userMasked ?? ""} onChange={e => setDraft(prev => ({ ...(prev as DbConnector), userMasked: e.target.value }))} />
              </div>
              <div className="col-md-6 d-flex align-items-end">
                <div className="form-check form-switch">
                  <input id="edit-ssl" className="form-check-input" type="checkbox" checked={(draft as DbConnector).ssl ?? false} onChange={e => setDraft(prev => ({ ...(prev as DbConnector), ssl: e.target.checked }))} />
                  <label htmlFor="edit-ssl" className="form-check-label">Require SSL</label>
                </div>
              </div>
            </>
          )}

          <div className="col-12">
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows={2} value={draft.notes ?? ""} onChange={e => field("notes", e.target.value)} />
          </div>
        </div>
      </div>

      <div className="border-top p-3 d-flex justify-content-between">
        <div className="text-muted small">
          Placeholder only — secrets are not stored; masked fields are for demo.
        </div>
        <div className="btn-group">
          <button className="btn btn-outline-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={() => onSave(draft)}>
            <i className="bi bi-save" /> Save
          </button>
        </div>
      </div>
    </div>
  );
}
