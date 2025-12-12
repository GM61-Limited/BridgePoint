
// src/pages/connectors.tsx
import { useEffect, useMemo, useRef, useState } from "react";

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
};

type AnyConnector = ApiConnector | DbConnector;

/* =========================================================================
   Helpers
   ========================================================================= */
const nowIso = () => new Date().toISOString();
const inMinutes = (mins: number) => new Date(Date.now() + mins * 60_000).toISOString();
const fmtTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

// REMOVED: randChoice (unused) to satisfy TS6133 noUnusedLocals
function maskTail(s?: string, tail = 4) {
  if (!s) return "";
  return "•".repeat(Math.max(0, s.length - tail)) + s.slice(-tail);
}

/** Theme-friendly status chip */
function statusChip(status: Status) {
  const map: Record<Status, { text: string; className: string; icon: string }> = {
    connected:   { text: "Connected",   className: "text-success", icon: "bi-check-circle" },
    connecting:  { text: "Connecting…", className: "text-warning", icon: "bi-arrow-repeat" },
    disconnected:{ text: "Disconnected",className: "text-muted",   icon: "bi-slash-circle" },
    error:       { text: "Error",       className: "text-danger",  icon: "bi-exclamation-triangle" },
  };
  return map[status];
}

/* =========================================================================
   Seed (placeholder) data
   Place your logos at: /public/images/{assure|tdoc|healthedge|intacct|xero}.png
   ========================================================================= */
function seedConnectors(): AnyConnector[] {
  const base: AnyConnector[] = [
    {
      id: "api-assure",
      name: "Assure",
      category: "api",
      provider: "Assure",
      env: "Prod",
      enabled: true,
      status: "connected",
      baseUrl: "https://assure.example/api",
      authType: "apiKey",
      maskedKey: maskTail("ASSURE_DEMO_KEY_123456"),
      lastSyncAt: inMinutes(-8),
      nextSyncAt: inMinutes(7),
      notes: "Track & Trace connector (cycles, trays, events).",
      logoUrl: "/images/assure.png",
    },
    {
      id: "api-tdoc",
      name: "T-DOC",
      category: "api",
      provider: "TDOC",
      env: "Test",
      enabled: true,
      status: "connecting",
      baseUrl: "https://tdoc.example/api",
      authType: "basic",
      maskedKey: maskTail("svc_tdoc:********"),
      lastSyncAt: inMinutes(-60),
      nextSyncAt: inMinutes(15),
      notes: "Master data import + steriliser graphs when provided.",
      logoUrl: "/images/tdoc.png",
    },
    {
      id: "api-he",
      name: "HealthEdge",
      category: "api",
      provider: "HealthEdge",
      env: "Prod",
      enabled: true,
      status: "connected",
      baseUrl: "https://healthedge.example/api",
      authType: "custom",
      maskedKey: maskTail("he_token_ABCDEF1234"),
      lastSyncAt: inMinutes(-12),
      nextSyncAt: inMinutes(3),
      notes: "Throughput & priority feeds (Padawan pipeline).",
      logoUrl: "/images/healthedge.png",
    },
    {
      id: "api-intacct",
      name: "Sage Intacct",
      category: "api",
      provider: "Sage Intacct",
      env: "Prod",
      enabled: true,
      status: "connected",
      baseUrl: "https://api.intacct.com/ia/api",
      authType: "oauth2",
      maskedKey: maskTail("si_client_secret_demo"),
      lastSyncAt: inMinutes(-30),
      nextSyncAt: inMinutes(30),
      notes: "AR Invoices; activity-to-invoice orchestration.",
      logoUrl: "/images/intacct.png",
    },
    {
      id: "api-xero",
      name: "Xero",
      category: "api",
      provider: "Xero",
      env: "Test",
      enabled: false,
      status: "disconnected",
      baseUrl: "https://api.xero.com",
      authType: "oauth2",
      maskedKey: maskTail("xero_client_secret"),
      lastSyncAt: null,
      nextSyncAt: null,
      notes: "Optional alternative ERP pathway.",
      logoUrl: "/images/xero.png",
    },
    // Databases
    {
      id: "db-pg",
      name: "PostgreSQL",
      category: "database",
      provider: "PostgreSQL",
      env: "Prod",
      enabled: true,
      status: "connected",
      host: "pg.bridgepoint.local",
      port: 5432,
      dbName: "bridgepoint",
      userMasked: "svc_bridgepoint",
      ssl: true,
      lastSyncAt: inMinutes(-5),
      nextSyncAt: inMinutes(5),
      notes: "Primary operational store (containers).",
      logoUrl: "/images/postgres.png",
    },
    {
      id: "db-mysql",
      name: "MySQL",
      category: "database",
      provider: "MySQL",
      env: "Test",
      enabled: true,
      status: "disconnected",
      host: "mysql.lab.local",
      port: 3306,
      dbName: "assure_compat",
      userMasked: "svc_mysql",
      ssl: false,
      lastSyncAt: null,
      nextSyncAt: null,
      notes: "Lab compatibility tests for legacy adapters.",
      logoUrl: "/images/mysql.png",
    },
    {
      id: "db-mssql",
      name: "Microsoft SQL Server",
      category: "database",
      provider: "Microsoft SQL Server",
      env: "Prod",
      enabled: true,
      status: "connected",
      host: "mssql.internal",
      port: 1433,
      dbName: "bridgepoint_dw",
      userMasked: "svc_dw",
      ssl: true,
      lastSyncAt: inMinutes(-55),
      nextSyncAt: inMinutes(5),
      notes: "DW/SSIS landing (if required).",
      logoUrl: "/images/mssql.png",
    },
    {
      id: "db-azuresql",
      name: "Azure SQL",
      category: "database",
      provider: "Azure SQL",
      env: "Prod",
      enabled: true,
      status: "connecting",
      host: "tcp:gm61-bridgepoint.database.windows.net",
      port: 1433,
      dbName: "bp_core",
      userMasked: "bp_admin",
      ssl: true,
      lastSyncAt: inMinutes(-2),
      nextSyncAt: inMinutes(10),
      notes: "Cloud BI + finance staging.",
      logoUrl: "/images/azuresql.png",
    },
  ];
  return base;
}

/* =========================================================================
   Page
   ========================================================================= */
export default function Connectors() {
  const [connectors, setConnectors] = useState<AnyConnector[]>(seedConnectors());
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<AnyConnector | null>(null);
  const [nowTick, setNowTick] = useState<number>(Date.now());

  // 1s tick for "Last updated" feel and to drive simulated status transitions if needed
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // light simulation: randomly flip a connector from connecting->connected or connected->error occasionally
  useEffect(() => {
    const t = setInterval(() => {
      setConnectors(prev => prev.map(c => {
        if (!c.enabled) return c;
        const roll = Math.random();
        if (c.status === "connecting" && roll < 0.4) {
          return { ...c, status: "connected", lastSyncAt: nowIso(), nextSyncAt: inMinutes(10) };
        }
        if (c.status === "connected" && roll < 0.02) {
          return { ...c, status: "error", notes: (c.notes ?? "") + "" };
        }
        if (c.status === "error" && roll < 0.15) {
          return { ...c, status: "connecting" };
        }
        return c;
      }));
    }, 12_000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return connectors.filter(c => {
      if (filter !== "all" && c.category !== filter) return false;
      if (!q) return true;
      const hay =
        (c.name + " " + ("provider" in c ? c.provider : "") + " " + c.env + " " + (c.notes ?? "")).toLowerCase();
      return hay.includes(q);
    });
  }, [connectors, filter, query]);

  const apis = filtered.filter(c => c.category === "api") as ApiConnector[];
  const dbs  = filtered.filter(c => c.category === "database") as DbConnector[];

  /* ---- actions ---- */
  function updateConnector(updated: AnyConnector) {
    setConnectors(prev => prev.map(c => (c.id === updated.id ? updated : c)));
  }

  function testConnection(c: AnyConnector) {
    const testing = { ...c, status: "connecting" as Status };
    updateConnector(testing);
    // simulate async
    setTimeout(() => {
      const ok = Math.random() > 0.12;
      updateConnector({
        ...testing,
        status: ok ? "connected" : "error",
        lastSyncAt: ok ? nowIso() : c.lastSyncAt ?? null,
        nextSyncAt: ok ? inMinutes(10) : null,
      });
    }, 1200);
  }

  function syncNow(c: AnyConnector) {
    updateConnector({ ...c, status: "connecting" });
    setTimeout(() => {
      updateConnector({ ...c, status: "connected", lastSyncAt: nowIso(), nextSyncAt: inMinutes(15) });
    }, 900);
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

  /* ---- render ---- */
  return (
    <div className="container-xxl py-3">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">Connectors</h2>
        <div className="text-muted small">Last refresh: {new Date(nowTick).toLocaleTimeString()}</div>
      </div>

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
              <div className="text-muted">No API connectors match your filters.</div>
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
              <div className="text-muted">No database connectors match your filters.</div>
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
            Placeholder only — when the API is available, these controls will call live endpoints for auth, ping, and sync jobs.
          </div>
        </div>
      </div>

      {/* Edit modal */}
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
   Edit Modal (theme-aware, dependency-free)
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
