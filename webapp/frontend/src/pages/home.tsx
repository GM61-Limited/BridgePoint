// src/pages/home.tsx
import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { useModules } from "../features/modules/ModulesContext";
import {
  api,
  getApiErrorMessage,
  getEnvironment,
  getMe,
  listAuditLogs,
  listMachines,
  listWasherCycles,
  type AuditLog,
  type Machine,
  type WasherCycle,
} from "../lib/api";

type HealthResponse = { ok: boolean; time?: string; message?: string };

type Kpi = {
  totalDevices: number | null;
  activeDevices: number | null;
  faults: number | null;
  lastCycleAt?: string | null;
};

function firstNameFromUser(me: any): string {
  const f = String(me?.first_name ?? me?.firstName ?? "").trim();
  if (f) return f;
  const name = String(me?.name ?? me?.username ?? "").trim();
  if (!name) return "there";
  if (name.includes(",")) {
    const parts = name
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length > 1) return parts[1].split(/\s+/)[0] || "there";
  }
  return name.split(/\s+/)[0] || "there";
}

function isAdminFromUser(user: any): boolean {
  if (!user) return false;
  if (Array.isArray(user.roles)) {
    return user.roles.map((r: any) => String(r).toLowerCase()).includes("admin");
  }
  const role = String(user.role ?? user.user_role ?? user.userRole ?? "").toLowerCase();
  return role === "admin";
}

function formatWhen(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? String(iso) : d.toLocaleString();
}

function badgeClass(ok: boolean | null): string {
  if (ok === true) return "badge text-bg-success";
  if (ok === false) return "badge text-bg-danger";
  return "badge text-bg-secondary";
}

export default function Home() {
  const { user: authUser } = useAuth();
  const { environment, isEnabled, loading: modulesLoading } = useModules();

  const isAdmin = isAdminFromUser(authUser);

  const [me, setMe] = React.useState<any>(authUser ?? null);
  const [env, setEnv] = React.useState<any>(environment ?? null);
  const [health, setHealth] = React.useState<HealthResponse | null>(null);

  const [kpi, setKpi] = React.useState<Kpi>({
    totalDevices: null,
    activeDevices: null,
    faults: null,
    lastCycleAt: null,
  });

  const [recent, setRecent] = React.useState<AuditLog[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const showMachineMonitoring = isEnabled("machine-monitoring");
  const showIntegrationHub = isEnabled("integration-hub");
  const showAnalytics = isEnabled("analytics");
  const showFinance = isEnabled("finance");

  React.useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        // 1) Health (always safe)
        try {
          const res = await api.get<HealthResponse>("/health");
          if (!cancelled) setHealth(res.data);
        } catch (e) {
          if (!cancelled) setHealth({ ok: false, message: getApiErrorMessage(e) });
        }

        // 2) Profile + environment (prefer context, but refresh from API)
        const [meData, envData] = await Promise.all([
          getMe().catch(() => null),
          getEnvironment().catch(() => null),
        ]);

        if (!cancelled) {
          if (meData) setMe(meData);
          if (envData) setEnv(envData);
        }

        // 3) Module KPIs (only for machine monitoring for now)
        if (showMachineMonitoring) {
          const [machines, cycles] = await Promise.all([
            listMachines().catch(() => [] as Machine[]),
            listWasherCycles().catch(() => [] as WasherCycle[]),
          ]);

          const totalDevices = machines.length;
          const activeDevices = machines.filter((m: any) => (m as any).is_active !== false).length;

          // Faults: count cycles where result === false (simple, high-level)
          const faults = cycles.filter((c: any) => c?.result === false).length;

          // Last cycle timestamp (prefer ended_at then started_at)
          const lastCycleAt =
            cycles
              .map((c: any) => c?.ended_at ?? c?.started_at)
              .filter(Boolean)
              .map((s: any) => String(s))
              .sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0] ?? null;

          if (!cancelled) {
            setKpi({ totalDevices, activeDevices, faults, lastCycleAt });
          }
        } else {
          if (!cancelled) {
            setKpi({ totalDevices: null, activeDevices: null, faults: null, lastCycleAt: null });
          }
        }

        // 4) Recent notifications (Admin only): use audit logs as “recent activity”
        if (isAdmin) {
          try {
            const page = await listAuditLogs({ page: 1, limit: 5 });
            if (!cancelled) setRecent(page.items ?? []);
          } catch {
            if (!cancelled) setRecent([]);
          }
        } else {
          if (!cancelled) setRecent([]);
        }
      } catch (e: any) {
        if (!cancelled) setError(getApiErrorMessage(e) || "Failed to load home page.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [showMachineMonitoring, isAdmin]);

  const firstName = firstNameFromUser(me);

  const modulesInstalled = React.useMemo(() => {
    const list: { key: string; name: string; enabled: boolean; to?: string }[] = [
      { key: "machine-monitoring", name: "Machine Monitoring", enabled: showMachineMonitoring, to: "/machines/dashboard" },
      { key: "integration-hub", name: "Integration Hub", enabled: showIntegrationHub, to: "/pipelines" },
      { key: "analytics", name: "Analytics", enabled: showAnalytics, to: "/dashboards" },
      { key: "finance", name: "Finance", enabled: showFinance, to: "/finance" },
    ];
    return list;
  }, [showMachineMonitoring, showIntegrationHub, showAnalytics, showFinance]);

  return (
    <div className="container-xxl py-3">
      {/* HERO */}
      <section className="p-3 p-sm-4 rounded-4 border bg-body mb-3">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          <img
            src="/images/bridgepointAlt.png"
            alt="BridgePoint"
            style={{ width: 52, height: 52 }}
          />
          <div>
            <h1 className="h4 mb-1">Welcome, {firstName}</h1>
            <div className="text-secondary">
              Your operational hub for machine monitoring, integrations and compliance.
            </div>
          </div>

          <div className="ms-auto d-flex align-items-center gap-2 flex-wrap">
            <span className={badgeClass(health?.ok ?? null)}>
              {health?.ok ? "API Healthy" : "API Unhealthy"}
            </span>

            <span className="badge text-bg-secondary">
              {modulesLoading ? "Loading environment…" : (env?.name ?? environment?.name ?? "Environment")}
            </span>

            <NavLink to="/settings" className="btn btn-sm btn-outline-secondary">
              <i className="bi bi-gear me-1" aria-hidden="true" />
              Settings
            </NavLink>

            <NavLink to="/help" className="btn btn-sm btn-outline-secondary">
              <i className="bi bi-question-circle me-1" aria-hidden="true" />
              Help
            </NavLink>
          </div>
        </div>
      </section>

      {loading && (
        <div className="alert alert-info" role="status" aria-live="polite">
          Loading your workspace…
        </div>
      )}

      {error && (
        <div className="alert alert-warning" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* MODULES INSTALLED */}
          <section className="card mb-3">
            <div className="card-header d-flex align-items-center justify-content-between">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-grid" aria-hidden="true" />
                <strong>Modules installed</strong>
              </div>
              <span className="text-muted small">
                Enabled features for {env?.name ?? environment?.name ?? "this environment"}
              </span>
            </div>
            <div className="card-body">
              <div className="row g-3">
                {modulesInstalled.map((m) => (
                  <div className="col-sm-6 col-lg-3" key={m.key}>
                    <div className="p-3 border rounded h-100 d-flex flex-column">
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="fw-semibold">{m.name}</div>
                        <span className={`badge ${m.enabled ? "text-bg-success" : "text-bg-secondary"}`}>
                          {m.enabled ? "Enabled" : "Disabled"}
                        </span>
                      </div>
                      <div className="text-secondary small mt-2 flex-grow-1">
                        {m.key === "machine-monitoring" && "Washers, telemetry, uploads, cycle history."}
                        {m.key === "integration-hub" && "Pipelines and connectors for integrations."}
                        {m.key === "analytics" && "Dashboards and insights."}
                        {m.key === "finance" && "Billing and chargebacks."}
                      </div>
                      {m.enabled && m.to ? (
                        <NavLink to={m.to} className="btn btn-sm btn-outline-primary mt-3">
                          Open <i className="bi bi-arrow-right ms-1" aria-hidden="true" />
                        </NavLink>
                      ) : (
                        <button className="btn btn-sm btn-outline-secondary mt-3" disabled>
                          Not available
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* KPI ROW (Machine Monitoring only for now) */}
          {showMachineMonitoring && (
            <section className="row g-3 mb-3" aria-label="High level KPIs">
              <div className="col-sm-6 col-xl-3">
                <KpiCard
                  title="Total devices"
                  icon="bi-hdd-stack"
                  value={kpi.totalDevices}
                  tone="secondary"
                  foot="All registered machines"
                />
              </div>

              <div className="col-sm-6 col-xl-3">
                <KpiCard
                  title="Active devices"
                  icon="bi-check-circle"
                  value={kpi.activeDevices}
                  tone="success"
                  foot="Currently enabled"
                />
              </div>

              <div className="col-sm-6 col-xl-3">
                <KpiCard
                  title="Fault cycles"
                  icon="bi-x-octagon"
                  value={kpi.faults}
                  tone="danger"
                  foot="Total cycles with FAIL result"
                />
              </div>

              <div className="col-sm-6 col-xl-3">
                {/* ✅ FIX: KpiCard.value is number|null; use displayValue for text */}
                <KpiCard
                  title="Last cycle"
                  icon="bi-clock-history"
                  value={null}
                  tone="primary"
                  foot={kpi.lastCycleAt ? formatWhen(kpi.lastCycleAt) : "—"}
                  displayValue={kpi.lastCycleAt ? "Latest" : "—"}
                />
              </div>
            </section>
          )}

          {/* QUICK LINKS */}
          <section className="row g-3 mb-3" aria-label="Quick links">
            <QuickLink
              title="Settings"
              icon="bi-gear"
              to="/settings"
              copy="Manage your profile, users and modules."
            />
            <QuickLink
              title="Help"
              icon="bi-question-circle"
              to="/help"
              copy="Guides, troubleshooting and contact."
            />
            {showMachineMonitoring && (
              <QuickLink
                title="Machine Dashboard"
                icon="bi-graph-up"
                to="/machines/dashboard"
                copy="Detailed analytics for washer cycles."
              />
            )}
            {showMachineMonitoring && (
              <QuickLink
                title="Machines"
                icon="bi-hdd-stack"
                to="/machines"
                copy="View and manage devices."
              />
            )}
          </section>

          {/* ABOUT + NOTIFICATIONS */}
          <section className="row g-3">
            <div className="col-xl-7">
              <div className="card h-100">
                <div className="card-header d-flex align-items-center gap-2">
                  <i className="bi bi-info-circle" aria-hidden="true" />
                  <strong>About BridgePoint</strong>
                </div>
                <div className="card-body">
                  <p className="mb-2">
                    BridgePoint provides a cloud-first operational layer for sterile services:
                    monitoring, integrations, and audit-ready workflows — designed to scale across sites.
                  </p>
                  <ul className="text-secondary small mb-0">
                    <li>Tenant-scoped access control</li>
                    <li>Audit logging and traceability</li>
                    <li>Containerised deployment for portability</li>
                    <li>AI-ready architecture (future modules)</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="col-xl-5">
              <div className="card h-100">
                <div className="card-header d-flex align-items-center justify-content-between">
                  <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-bell" aria-hidden="true" />
                    <strong>Recent notifications</strong>
                  </div>

                  {isAdmin ? (
                    <NavLink to="/logs" className="btn btn-sm btn-outline-secondary">
                      View logs
                    </NavLink>
                  ) : (
                    <span className="text-muted small">Admin-only</span>
                  )}
                </div>

                <div className="card-body p-0">
                  {isAdmin ? (
                    recent.length === 0 ? (
                      <div className="p-3 text-muted">No recent events.</div>
                    ) : (
                      <div className="list-group list-group-flush">
                        {recent.map((it) => (
                          <div key={String(it.id)} className="list-group-item bg-transparent">
                            <div className="d-flex justify-content-between gap-2">
                              <div className="fw-semibold">{it.action}</div>
                              <div className="text-muted small">{formatWhen(it.created_at)}</div>
                            </div>
                            <div className="text-secondary small">
                              {it.user_email || it.user_name || (it.user_id ? `User#${it.user_id}` : "System")}
                              {it.entity_type ? ` • ${it.entity_type}${it.entity_id != null ? `#${it.entity_id}` : ""}` : ""}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  ) : (
                    <div className="p-3 text-muted">
                      Notifications are available to administrators. Please contact your admin if you need access.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ----------------------- Local components ---------------------- */

function KpiCard({
  title,
  icon,
  value,
  tone,
  foot,
  displayValue,
}: {
  title: string;
  icon: string;
  value: number | null;
  tone: "success" | "danger" | "primary" | "secondary";
  foot?: string;
  displayValue?: string;
}) {
  const shown = displayValue ?? (value == null ? "—" : String(value));
  return (
    <div className="card h-100">
      <div className="card-body">
        <div className="d-flex align-items-center justify-content-between">
          <div className="text-muted small">{title}</div>
          <i className={`bi ${icon}`} aria-hidden="true" />
        </div>
        <div className="display-6 my-2">{shown}</div>
        {foot ? <div className="text-secondary small">{foot}</div> : null}
        <span className={`badge bg-${tone} mt-2`}>{tone}</span>
      </div>
    </div>
  );
}

function QuickLink({
  title,
  icon,
  to,
  copy,
}: {
  title: string;
  icon: string;
  to: string;
  copy: string;
}) {
  return (
    <div className="col-sm-6 col-xl-3">
      <div className="card h-100">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between">
            <div className="fw-semibold">{title}</div>
            <i className={`bi ${icon}`} aria-hidden="true" />
          </div>
          <div className="text-secondary small mt-2">{copy}</div>
          <NavLink to={to} className="btn btn-sm btn-outline-primary mt-3">
            Open <i className="bi bi-arrow-right ms-1" aria-hidden="true" />
          </NavLink>
        </div>
      </div>
    </div>
  );
}