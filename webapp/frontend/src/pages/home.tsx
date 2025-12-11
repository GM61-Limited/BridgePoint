
// src/pages/home.tsx
import React from "react";
import { NavLink, useNavigate } from "react-router-dom";

/** Dev: http://localhost:8000 ; Prod: /api behind Nginx */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

/* ---------------------------- Types ---------------------------- */
type MeResponse = {
  name: string;
  roles: string[];
  environment_id: number;
};

type EnvironmentResponse = {
  id: number;
  name: string;
  domain: string;
};

type HealthResponse = {
  ok: boolean;
  time?: string;
};

interface HomeProps {
  /** If you already keep the token in context, you can pass it here. Otherwise it’s read from storage. */
  token?: string;
}

/* ----------------------- Token utilities ----------------------- */
function getTokenFromStorage(): string | null {
  return (
    sessionStorage.getItem("bp_token") ||
    localStorage.getItem("bp_token") ||
    null
  );
}

/* -------------------------- Component -------------------------- */
const Home: React.FC<HomeProps> = ({ token }) => {
  const navigate = useNavigate();

  const [user, setUser] = React.useState<MeResponse | null>(null);
  const [env, setEnv] = React.useState<EnvironmentResponse | null>(null);
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    const abort = new AbortController();

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const jwt = token ?? getTokenFromStorage();
        if (!jwt) {
          // No token → go to login
          navigate("/login");
          return;
        }
        const headers = { Authorization: `Bearer ${jwt}` };

        // ---- /me
        const meRes = await fetch(`${API_BASE}/me`, {
          method: "GET",
          headers,
          signal: abort.signal,
        });

        if (meRes.status === 401) {
          // Token invalid/expired → clear and redirect
          sessionStorage.removeItem("bp_token");
          localStorage.removeItem("bp_token");
          navigate("/login");
          return;
        }
        if (!meRes.ok) {
          throw new Error(`Failed to load /me (${meRes.status})`);
        }
        const meData: MeResponse = await meRes.json();
        setUser(meData);

        // ---- /environment (optional badge)
        const envRes = await fetch(`${API_BASE}/environment`, {
          method: "GET",
          headers,
          signal: abort.signal,
        });
        if (envRes.ok) {
          const envData: EnvironmentResponse = await envRes.json();
          setEnv(envData);
        }

        // ---- /health (API health)
        const healthRes = await fetch(`${API_BASE}/health`, {
          method: "GET",
          signal: abort.signal,
        });
        if (healthRes.ok) {
          const healthData: HealthResponse = await healthRes.json();
          setHealth(healthData);
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          setError(e?.message ?? "Something went wrong");
        }
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => abort.abort();
  }, [token, navigate]);

  const displayName = user?.name?.trim() ? user.name : "there";

  return (
    <div className="home-v2 container-fluid">
      {/* Hero band */}
      <section className="hero mt-3 p-3 p-sm-4 rounded-4">
        <div className="d-flex align-items-center gap-3 flex-wrap">
          {/* Logo from /public/images */}
          <img
            src="/images/bridgepointAlt.png"
            alt="BridgePoint"
            className="hero-logo"
            style={{ width: 48, height: 48 }}
          />
          <div>
            <h1 className="h4 mb-1">Welcome, {displayName}</h1>
            <p className="mb-0 text-secondary">
              Secure integration platform for sterile services — connect, orchestrate, and surface insights.
            </p>
          </div>
          {env && (
            <div className="ms-auto">
              <span className="badge bg-light text-dark border">
                {env.name} · {env.domain}
              </span>
            </div>
          )}
        </div>
      </section>

      {/* Loading / errors */}
      {loading && (
        <div className="alert alert-info mt-3" role="status" aria-live="polite">
          Loading your profile…
        </div>
      )}
      {error && (
        <div className="alert alert-danger mt-3" role="alert">
          {error}
        </div>
      )}

      {/* Main content (only when not loading/error) */}
      {!loading && !error && (
        <>
          {/* System status row */}
          <section className="mt-3" aria-label="System status and profile">
            <div className="row g-3">
              <div className="col-sm-6 col-xl-3">
                <StatusCard
                  title="API Health"
                  icon="bi-heart-pulse"
                  status={health?.ok ? "Healthy" : "Offline"}
                  tone={health?.ok ? "success" : "danger"}
                  note={health?.time ? new Date(health.time).toLocaleString() : undefined}
                />
              </div>
              <div className="col-sm-6 col-xl-3">
                <StatusCard
                  title="Profile"
                  icon="bi-person-check"
                  status={displayName}
                  tone="primary"
                  note={user?.roles?.length ? user.roles.join(", ") : "—"}
                />
              </div>
              <div className="col-sm-6 col-xl-3">
                <StatusCard title="Pipelines (24h)" icon="bi-diagram-3" status="—" tone="secondary" />
              </div>
              <div className="col-sm-6 col-xl-3">
                <StatusCard title="Connectors Down" icon="bi-plug" status="—" tone="secondary" />
              </div>
            </div>
          </section>

          {/* Quick navigation tiles */}
          <section aria-label="Quick navigation" className="mt-4">
            <div className="row g-3">
              <ActionCard
                title="Pipelines"
                icon="bi-diagram-3"
                to="/pipelines"
                copy="Orchestration health, retries, and lineage."
              />
              <ActionCard
                title="Connectors"
                icon="bi-plug"
                to="/connectors"
                copy="Device/API adapters and ETL collectors status."
              />
              <ActionCard
                title="Alerts"
                icon="bi-bell"
                to="/alerts"
                copy="Active warnings and system notifications."
              />
            </div>
          </section>

          {/* Activity & throughput placeholders */}
          <section className="mt-4" aria-label="Status and activity">
            <div className="row g-3">
              <div className="col-xl-7">
                <div className="card h-100">
                  <div className="card-header">Pipeline Throughput (24h)</div>
                  <div
                    className="card-body border border-dashed"
                    style={{ height: 240 }}
                    aria-label="Chart placeholder"
                  >
                    {/* TODO: Replace with Chart.js or Power BI embed */}
                    <span className="text-secondary">Coming soon: KPIs from Azure SQL / Power BI.</span>
                  </div>
                </div>
              </div>

              <div className="col-xl-5">
                <div className="card h-100">
                  <div className="card-header d-flex align-items-center gap-2">
                    <i className="bi bi-activity" aria-hidden="true" /> Recent Activity
                  </div>
                  <div className="list-group list-group-flush">
                    <ActivityItem
                      icon="bi-arrow-repeat"
                      tone="warning"
                      text='ETL “WasherLogs-01” retrying (2 of 5)'
                    />
                    <ActivityItem icon="bi-plug" tone="danger" text='Connector “TDOC-AT” unreachable' />
                    <ActivityItem
                      icon="bi-check2-circle"
                      tone="success"
                      text='Orchestration job “FinanceSync” succeeded'
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
};

export default Home;

/* ----------------------- Local components ---------------------- */

function StatusCard({
  title,
  icon,
  status,
  tone,
  note,
}: {
  title: string;
  icon: string;
  status?: string;
  tone?: "success" | "danger" | "primary" | "secondary";
  note?: string;
}) {
  return (
    <div className="card h-100">
      <div className="card-body">
        <div className="d-flex align-items-center justify-content-between">
          <h6 className="card-title mb-0">{title}</h6>
          <i className={`bi ${icon}`} aria-hidden="true" />
        </div>
        <p className="display-6 my-2">{status ?? "—"}</p>
        {note && <p className="text-secondary mb-0">{note}</p>}
        {tone && <span className={`badge bg-${tone} mt-2`}>{tone}</span>}
      </div>
    </div>
  );
}

function ActionCard({
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
    <div className="col-sm-6 col-lg-4">
      <div className="card h-100">
        <div className="card-body">
          <div className="d-flex align-items-center justify-content-between">
            <h6 className="card-title mb-0">{title}</h6>
            <i className={`bi ${icon}`} aria-hidden="true" />
          </div>
          <p className="card-text mt-2">{copy}</p>
          <NavLink to={to} className="stretched-link" aria-label={`Open ${title}`}>
            Open
          </NavLink>
        </div>
      </div>
    </div>
  );
}

function ActivityItem({
  icon,
  tone,
  text,
}: {
  icon: string;
  tone: "success" | "danger" | "warning" | "info";
  text: string;
}) {
  return (
    <div className="list-group-item bg-transparent">
      <i className={`bi ${icon} me-2 text-${tone}`} aria-hidden="true" />
      {text}
    </div>
  );
}
