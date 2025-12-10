
import React from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";

/** Adjust to your build setup: in dev use http://localhost:8000; in prod use /api behind Nginx */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type MeResponse = {
  name: string;            // from /me
  roles: string[];
  environment_id: number;
};

type EnvironmentResponse = {
  id: number;
  name: string;
  domain: string;
};

interface HomeProps {
  /** If you already keep the token in context, you can pass it here. Otherwise we read from storage. */
  token?: string;
}

/** Finds a JWT wherever we commonly store it. Edit to match your login page. */
function getTokenFromStorage(): string | null {
  return (
    // Prefer sessionStorage in most SPAs to auto-expire with tab
    sessionStorage.getItem("bp_token") ||
    localStorage.getItem("bp_token") ||
    null
  );
}

const Home: React.FC<HomeProps> = ({ token }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const [user, setUser] = React.useState<MeResponse | null>(null);
  const [env, setEnv] = React.useState<EnvironmentResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Compute the navbar label: hostname + pathname (e.g., "localhost/home")
  const host = typeof window !== "undefined" ? window.location.hostname : "localhost";
  const path = location.pathname || "/home";
  const navLabel = `${host}${path}`;

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

        // ---- /me
        const meRes = await fetch(`${API_BASE}/me`, {
          method: "GET",
          headers: { Authorization: `Bearer ${jwt}` },
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
          headers: { Authorization: `Bearer ${jwt}` },
          signal: abort.signal,
        });
        if (envRes.ok) {
          const envData: EnvironmentResponse = await envRes.json();
          setEnv(envData);
        }

      } catch (e: any) {
        if (e?.name === "AbortError") return;
        setError(e?.message ?? "Something went wrong");
      } finally {
        setLoading(false);
      }
    }

    load();
    return () => abort.abort();
  }, [token, navigate]);

  const displayName = user?.name?.trim() ? user.name : "there"; // fallback if name is empty

  return (
    <div className="container-fluid">
      {/* Top navbar with current location */}
      <nav
        className="d-flex align-items-center justify-content-between py-2"
        aria-label="Primary"
        style={{ borderBottom: "1px solid #eee" }}
      >
        <div className="d-flex align-items-center gap-2">
          <span className="text-secondary small">You are here:</span>
          <strong>{navLabel}</strong>
        </div>

        {/* Environment badge (optional) */}
        {env && <span className="badge bg-secondary">{env.name}</span>}
      </nav>

      {/* Page header */}
      <header className="py-3 d-flex align-items-center justify-content-between">
        <div>
          <h1 className="h3 mb-1">Welcome, {displayName}</h1>
          <p className="text-secondary mb-0">Here’s your BridgePoint overview.</p>
        </div>

        {/* If you prefer the badge only in the navbar, remove this block */}
        {/* {env && <span className="badge bg-secondary">{env.name}</span>} */}
      </header>

      {loading && (
        <div className="alert alert-info" role="status">
          Loading your profile…
        </div>
      )}

      {error && (
        <div className="alert alert-danger" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && (
        <>
          {/* Quick navigation tiles */}
          <section aria-label="Quick navigation" className="mt-3">
            <div className="row g-3">
              <div className="col-sm-6 col-lg-4">
                <div className="card h-100">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between">
                      <h6 className="card-title mb-0">Pipelines</h6>
                      <i className="bi bi-diagram-3" aria-hidden="true" />
                    </div>
                    <p className="card-text mt-2">
                      Orchestration health, retries, and lineage.
                    </p>
                    <NavLink to="/pipelines" className="stretched-link" aria-label="Open Pipelines">
                      Open
                    </NavLink>
                  </div>
                </div>
              </div>

              <div className="col-sm-6 col-lg-4">
                <div className="card h-100">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between">
                      <h6 className="card-title mb-0">Connectors</h6>
                      <i className="bi bi-plug" aria-hidden="true" />
                    </div>
                    <p className="card-text mt-2">
                      Device/API adapters and ETL collectors status.
                    </p>
                    <NavLink to="/connectors" className="stretched-link" aria-label="Open Connectors">
                      Open
                    </NavLink>
                  </div>
                </div>
              </div>

              <div className="col-sm-6 col-lg-4">
                <div className="card h-100">
                  <div className="card-body">
                    <div className="d-flex align-items-center justify-content-between">
                      <h6 className="card-title mb-0">Alerts</h6>
                      <i className="bi bi-bell" aria-hidden="true" />
                    </div>
                    <p className="card-text mt-2">
                      Active warnings and system notifications.
                    </p>
                    <NavLink to="/alerts" className="stretched-link" aria-label="Open Alerts">
                      Open
                    </NavLink>
                  </div>
                </div>
              </div>
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
                  </div>
                </div>
              </div>

              <div className="col-xl-5">
                <div className="card h-100">
                  <div className="card-header">Recent Activity</div>
                  <div className="list-group list-group-flush">
                    <div className="list-group-item bg-transparent">
                      <i className="bi bi-arrow-repeat me-2 text-warning" aria-hidden="true" />
                      ETL Collector “WasherLogs-01” retrying (2 of 5)
                    </div>
                    <div className="list-group-item bg-transparent">
                      <i className="bi bi-plug me-2 text-danger" aria-hidden="true" />
                      Connector “TDOC-AT” unreachable
                    </div>
                    <div className="list-group-item bg-transparent">
                      <i className="bi bi-check2-circle me-2 text-success" aria-hidden="true" />
                      Orchestration job “FinanceSync” succeeded
                    </div>
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
