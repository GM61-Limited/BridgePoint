import React, { useCallback, useEffect, useMemo, useState } from "react";

/**
 * ==================================
 * CONFIG — EDIT THESE FEW LINES ONLY
 * ==================================
 */

// If you're using nginx proxy to backend at /api, keep API_BASE = "".
// If no proxy (local dev), set API_BASE = "http://localhost:8000" (or your backend URL).
const API_BASE = "";

// Auth mode:
// - true  => sends Authorization: Bearer <token from localStorage>
// - false => uses cookie sessions (credentials: "include")
const USE_BEARER_AUTH = true;
const TOKEN_STORAGE_KEY = "access_token"; // change if your key differs

// Endpoint for logs:
// Expected: GET /api/v1/audit-logs?query params...
const LOGS_ENDPOINT = `${API_BASE}/api/v1/audit-logs`;

/**
 * ==================================
 * TYPES — adjust to match your backend
 * ==================================
 */
type AuditLog = {
  id: string | number;

  // who
  user_id?: string | number | null;
  user_email?: string | null;
  user_name?: string | null;

  // what
  action: string; // e.g. "LOGIN", "UPLOAD_XML", "DELETE_MACHINE"
  entity_type?: string | null; // e.g. "machine", "cycle", "file"
  entity_id?: string | number | null;

  // where/how
  ip_address?: string | null;
  user_agent?: string | null;

  // when
  created_at: string; // ISO date-time string

  // optional details blob
  details?: any; // JSON object
};

// Many APIs return { items, total, page, page_size } or similar.
// This supports that, but also works if your API returns an array directly.
type LogsResponse =
  | AuditLog[]
  | {
      items: AuditLog[];
      total: number;
      page: number;
      page_size: number;
    };

/**
 * ==================================
 * HTTP helper
 * ==================================
 */
async function apiFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };

  // For GET requests, don't force content-type
  if (init.method && init.method.toUpperCase() !== "GET") {
    headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
  }

  if (USE_BEARER_AUTH) {
    const token = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(url, {
    ...init,
    headers,
    credentials: USE_BEARER_AUTH ? "omit" : "include",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const msg = text?.trim()
      ? `${res.status} ${res.statusText}: ${text}`
      : `${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  // handle 204 no content
  if (res.status === 204) return undefined as unknown as T;

  return (await res.json()) as T;
}

/**
 * ==================================
 * UI helpers
 * ==================================
 */
function formatDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toDateInputValue(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function safeJsonStringify(value: any) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function buildQuery(params: Record<string, string | number | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const s = String(v).trim();
    if (!s) continue;
    sp.set(k, s);
  }
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

/**
 * ==================================
 * Page component
 * ==================================
 */
export default function LogsPage() {
  // Filters
  const [q, setQ] = useState("");
  const [user, setUser] = useState("");
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [entityId, setEntityId] = useState("");

  // Date range (yyyy-mm-dd)
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return toDateInputValue(d.toISOString());
  });
  const [toDate, setToDate] = useState(() => toDateInputValue(new Date().toISOString()));

  // Pagination
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // Data
  const [items, setItems] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState<number | null>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Row expansion
  const [expandedId, setExpandedId] = useState<string | number | null>(null);

  const totalPages = useMemo(() => {
    if (total === null) return null;
    return Math.max(1, Math.ceil(total / pageSize));
  }, [total, pageSize]);

  const endpointUrl = useMemo(() => {
    return (
      LOGS_ENDPOINT +
      buildQuery({
        q,
        user,
        action,
        entity_type: entityType,
        entity_id: entityId,
        from: fromDate,
        to: toDate,
        page,
        limit: pageSize,
      })
    );
  }, [q, user, action, entityType, entityId, fromDate, toDate, page, pageSize]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await apiFetch<LogsResponse>(endpointUrl, { method: "GET" });

      if (Array.isArray(data)) {
        setItems(data);
        setTotal(null);
      } else {
        setItems(data.items ?? []);
        setTotal(typeof data.total === "number" ? data.total : null);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load logs.");
      setItems([]);
      setTotal(null);
    } finally {
      setLoading(false);
    }
  }, [endpointUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetFilters = useCallback(() => {
    setQ("");
    setUser("");
    setAction("");
    setEntityType("");
    setEntityId("");
    setPage(1);
    setExpandedId(null);
  }, []);

  const applyFilters = useCallback(() => {
    setPage(1);
    setExpandedId(null);
    void load();
  }, [load]);

  const toggleExpanded = useCallback((id: string | number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const prevPage = useCallback(() => {
    setExpandedId(null);
    setPage((p) => Math.max(1, p - 1));
  }, []);

  const nextPage = useCallback(() => {
    setExpandedId(null);
    setPage((p) => p + 1);
  }, []);

  return (
    <div style={styles.page}>
      <div style={styles.headerRow}>
        <div>
          <h2 style={styles.h2}>Audit Logs</h2>
          <div style={styles.muted}>
            Track who did what, when, and from where. Use filters to narrow down results.
          </div>
        </div>
        <div style={styles.headerActions}>
          <button onClick={() => void load()} style={styles.button} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </div>

      {error && (
        <div style={styles.errorBox}>
          <strong>Couldn’t load logs.</strong>
          <div style={{ marginTop: 6, whiteSpace: "pre-wrap" }}>{error}</div>
          <div style={{ marginTop: 10, display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => void load()} style={styles.button}>
              Retry
            </button>
            <button onClick={resetFilters} style={styles.buttonSecondary}>
              Reset filters
            </button>
          </div>

          <div style={{ marginTop: 10, ...styles.muted }}>
            If this is a <code>401</code>:
            {USE_BEARER_AUTH ? (
              <ul style={{ marginTop: 6 }}>
                <li>
                  Confirm the token exists in <code>localStorage["{TOKEN_STORAGE_KEY}"]</code>.
                </li>
                <li>
                  Confirm backend expects <code>Authorization: Bearer &lt;token&gt;</code>.
                </li>
              </ul>
            ) : (
              <ul style={{ marginTop: 6 }}>
                <li>Confirm you are logged in and cookies are set.</li>
                <li>Confirm backend allows CORS with credentials.</li>
              </ul>
            )}
          </div>
        </div>
      )}

      {/* FILTERS */}
      <div style={styles.card}>
        <div style={styles.filtersHeader}>
          <h3 style={styles.h3}>Filters</h3>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={applyFilters} style={styles.buttonPrimary} disabled={loading}>
              Apply
            </button>
            <button onClick={resetFilters} style={styles.buttonSecondary} disabled={loading}>
              Reset
            </button>
          </div>
        </div>

        <div style={styles.grid}>
          <div style={styles.field}>
            <label style={styles.label}>Search</label>
            <input
              style={styles.input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Free text (email, action, entity id, ip...)"
              disabled={loading}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>User (email or id)</label>
            <input
              style={styles.input}
              value={user}
              onChange={(e) => setUser(e.target.value)}
              placeholder="e.g. nick@company.com"
              disabled={loading}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Action</label>
            <input
              style={styles.input}
              value={action}
              onChange={(e) => setAction(e.target.value)}
              placeholder="e.g. LOGIN, UPLOAD_XML"
              disabled={loading}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Entity type</label>
            <input
              style={styles.input}
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              placeholder="e.g. machine, cycle, file"
              disabled={loading}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Entity id</label>
            <input
              style={styles.input}
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
              placeholder="e.g. 123"
              disabled={loading}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>From</label>
            <input
              style={styles.input}
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              disabled={loading}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>To</label>
            <input
              style={styles.input}
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              disabled={loading}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label}>Page size</label>
            <select
              style={styles.input}
              value={pageSize}
              onChange={(e) => {
                setPageSize(parseInt(e.target.value, 10));
                setPage(1);
              }}
              disabled={loading}
            >
              {[10, 25, 50, 100].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ marginTop: 10, ...styles.muted }}>
          Endpoint: <code>{endpointUrl}</code>
        </div>
      </div>

      {/* TABLE */}
      <div style={styles.card}>
        <div style={styles.tableHeaderRow}>
          <h3 style={styles.h3}>Results</h3>
          <div style={styles.muted}>
            {total !== null ? (
              <>
                Total: <strong>{total}</strong>{" "}
                {totalPages ? (
                  <>
                    • Page <strong>{page}</strong> of <strong>{totalPages}</strong>
                  </>
                ) : null}
              </>
            ) : (
              <>Showing <strong>{items.length}</strong> records</>
            )}
          </div>
        </div>

        {loading ? (
          <div style={styles.muted}>Loading…</div>
        ) : items.length === 0 ? (
          <div style={styles.muted}>No logs found for these filters.</div>
        ) : (
          <div style={styles.tableWrap}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Time</th>
                  <th style={styles.th}>User</th>
                  <th style={styles.th}>Action</th>
                  <th style={styles.th}>Entity</th>
                  <th style={styles.th}>IP</th>
                  <th style={styles.th}>Details</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const userLabel =
                    it.user_email ||
                    it.user_name ||
                    (it.user_id !== undefined && it.user_id !== null ? `User#${it.user_id}` : "Unknown");

                  const entityLabel =
                    it.entity_type
                      ? `${it.entity_type}${it.entity_id !== undefined && it.entity_id !== null ? `#${it.entity_id}` : ""}`
                      : it.entity_id !== undefined && it.entity_id !== null
                      ? `#${it.entity_id}`
                      : "—";

                  const isExpanded = expandedId === it.id;

                  return (
                    <React.Fragment key={String(it.id)}>
                      <tr style={styles.tr}>
                        <td style={styles.td}>{formatDateTime(it.created_at)}</td>
                        <td style={styles.td}>
                          <div style={{ fontWeight: 700 }}>{userLabel}</div>
                          {it.user_agent ? (
                            <div style={styles.mutedSmall} title={it.user_agent}>
                              {truncate(it.user_agent, 60)}
                            </div>
                          ) : null}
                        </td>
                        <td style={styles.td}>
                          <span style={styles.badge}>{it.action}</span>
                        </td>
                        <td style={styles.td}>{entityLabel}</td>
                        <td style={styles.td}>{it.ip_address || "—"}</td>
                        <td style={styles.td}>
                          <button
                            onClick={() => toggleExpanded(it.id)}
                            style={styles.smallButton}
                            disabled={!it.details}
                            title={it.details ? "View details" : "No details"}
                          >
                            {isExpanded ? "Hide" : "View"}
                          </button>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td style={styles.detailsCell} colSpan={6}>
                            <div style={styles.detailsBox}>
                              <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                                <strong>Details</strong>
                                <button
                                  onClick={() => copyToClipboard(safeJsonStringify(it.details))}
                                  style={styles.smallButton}
                                >
                                  Copy JSON
                                </button>
                              </div>
                              <pre style={styles.pre}>{safeJsonStringify(it.details)}</pre>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div style={styles.paginationRow}>
          <button onClick={prevPage} style={styles.buttonSecondary} disabled={loading || page <= 1}>
            ← Prev
          </button>

          <div style={styles.muted}>
            Page <strong>{page}</strong>
            {totalPages ? (
              <>
                {" "}
                / <strong>{totalPages}</strong>
              </>
            ) : null}
          </div>

          <button
            onClick={nextPage}
            style={styles.buttonSecondary}
            disabled={loading || (totalPages !== null && page >= totalPages)}
          >
            Next →
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ==================================
 * Utilities
 * ==================================
 */
function truncate(s: string, max: number) {
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const el = document.createElement("textarea");
    el.value = text;
    el.style.position = "fixed";
    el.style.left = "-9999px";
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }
}

/**
 * ==================================
 * Theme-aware styles (Bootstrap vars)
 * ==================================
 *
 * Because Layout sets `data-bs-theme` on <html>,
 * these CSS variables automatically switch between light/dark.
 */
const styles: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 1200,
    margin: "0 auto",
    padding: "24px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
    color: "var(--bs-body-color)",
  },

  headerRow: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "flex-start",
    flexWrap: "wrap",
  },
  headerActions: { display: "flex", gap: 8, alignItems: "center" },

  h2: { margin: 0, fontSize: 28, fontWeight: 800, color: "var(--bs-body-color)" },
  h3: { margin: 0, fontSize: 18, fontWeight: 800, color: "var(--bs-body-color)" },

  muted: { color: "var(--bs-secondary-color)", fontSize: 14 },
  mutedSmall: { color: "var(--bs-secondary-color)", fontSize: 12, marginTop: 4 },

  card: {
    background: "var(--bs-body-bg)",
    border: "1px solid var(--bs-border-color)",
    borderRadius: 10,
    padding: 16,
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  },

  filtersHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap",
    marginBottom: 12,
  },

  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(180px, 1fr))",
    gap: 12,
  },

  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, color: "var(--bs-body-color)", fontWeight: 700 },

  input: {
    padding: "10px 12px",
    border: "1px solid var(--bs-border-color)",
    borderRadius: 8,
    fontSize: 14,
    outline: "none",
    background: "var(--bs-body-bg)",
    color: "var(--bs-body-color)",
  },

  buttonPrimary: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--bs-primary)",
    background: "var(--bs-primary)",
    color: "var(--bs-white)",
    cursor: "pointer",
    fontWeight: 800,
  },
  buttonSecondary: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--bs-border-color)",
    background: "transparent",
    color: "var(--bs-body-color)",
    cursor: "pointer",
    fontWeight: 700,
  },
  button: {
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--bs-border-color)",
    background: "transparent",
    color: "var(--bs-body-color)",
    cursor: "pointer",
    fontWeight: 700,
  },
  smallButton: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid var(--bs-border-color)",
    background: "transparent",
    color: "var(--bs-body-color)",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 12,
  },

  errorBox: {
    background: "rgba(var(--bs-danger-rgb), 0.12)",
    border: "1px solid rgba(var(--bs-danger-rgb), 0.35)",
    borderRadius: 10,
    padding: 16,
    color: "var(--bs-danger)",
  },

  tableHeaderRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 10,
  },

  tableWrap: {
    width: "100%",
    overflowX: "auto",
    border: "1px solid var(--bs-border-color)",
    borderRadius: 10,
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    minWidth: 900,
    background: "var(--bs-body-bg)",
    color: "var(--bs-body-color)",
  },
  th: {
    textAlign: "left",
    padding: "10px 12px",
    fontSize: 13,
    color: "var(--bs-body-color)",
    borderBottom: "1px solid var(--bs-border-color)",
    background: "var(--bs-tertiary-bg)",
    position: "sticky",
    top: 0,
    zIndex: 1,
  },
  tr: {
    borderBottom: "1px solid var(--bs-border-color)",
  },
  td: {
    padding: "10px 12px",
    fontSize: 14,
    verticalAlign: "top",
    color: "var(--bs-body-color)",
  },

  badge: {
    display: "inline-block",
    padding: "4px 8px",
    borderRadius: 999,
    background: "rgba(var(--bs-primary-rgb), 0.12)",
    border: "1px solid rgba(var(--bs-primary-rgb), 0.25)",
    color: "var(--bs-body-color)",
    fontWeight: 800,
    fontSize: 12,
  },

  detailsCell: {
    padding: 12,
    background: "var(--bs-tertiary-bg)",
    borderBottom: "1px solid var(--bs-border-color)",
  },
  detailsBox: {
    border: "1px solid var(--bs-border-color)",
    borderRadius: 10,
    padding: 12,
    background: "var(--bs-body-bg)",
    color: "var(--bs-body-color)",
  },
  pre: {
    marginTop: 10,
    background: "var(--bs-tertiary-bg)",
    padding: 12,
    borderRadius: 8,
    overflowX: "auto",
    border: "1px solid var(--bs-border-color)",
    fontSize: 12,
    color: "var(--bs-body-color)",
  },

  paginationRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
  },
};