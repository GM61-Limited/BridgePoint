
// src/pages/_layout.tsx
import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";

/** Dev: http://localhost:8000 ; Prod: /api behind Nginx */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type EnvironmentResponse = { id: number; name: string; domain: string };

function getTokenFromStorage(): string | null {
  return sessionStorage.getItem("bp_token") || localStorage.getItem("bp_token") || null;
}

export default function Layout() {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = React.useState(false);
  const [env, setEnv] = React.useState<EnvironmentResponse | null>(null);

  // Fetch environment for topbar badge (Home also shows it; showing here helps everywhere)
  React.useEffect(() => {
    const abort = new AbortController();
    async function loadEnv() {
      try {
        const jwt = getTokenFromStorage();
        if (!jwt) return;
        const res = await fetch(`${API_BASE}/environment`, {
          headers: { Authorization: `Bearer ${jwt}` },
          signal: abort.signal,
        });
        if (res.ok) setEnv(await res.json());
      } catch {/* ignore */}
    }
    loadEnv();
    return () => abort.abort();
  }, []);

  function handleSignOut() {
    sessionStorage.removeItem("bp_token");
    localStorage.removeItem("bp_token");
    navigate("/login");
  }

  return (
    <div className={`app-shell d-flex ${collapsed ? "sidebar-collapsed" : ""}`}>

      {/* ---------- Sidebar ---------- */}
      <aside className="sidebar text-white">
        <div className="px-3 py-3 d-flex align-items-center border-bottom border-secondary">
          <i className="bi bi-hdd-stack fs-4 me-2" aria-hidden="true" />
          <span className="fw-semibold sidebar-label">BridgePoint</span>
        </div>

        <nav className="nav flex-column px-2 py-2" aria-label="Primary">
          <NavLink
            to="/home"
            end
            className={({ isActive }) =>
              `nav-link d-flex align-items-center ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-speedometer2 me-2" aria-hidden="true" />
            <span className="sidebar-label">Home</span>
          </NavLink>

          <NavLink
            to="/pipelines"
            className={({ isActive }) =>
              `nav-link d-flex align-items-center ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-diagram-3 me-2" aria-hidden="true" />
            <span className="sidebar-label">Pipelines</span>
          </NavLink>

          <NavLink
            to="/connectors"
            className={({ isActive }) =>
              `nav-link d-flex align-items-center ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-plug me-2" aria-hidden="true" />
            <span className="sidebar-label">Connectors</span>
          </NavLink>

          <NavLink
            to="/alerts"
            className={({ isActive }) =>
              `nav-link d-flex align-items-center ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-bell me-2" aria-hidden="true" />
            <span className="sidebar-label">Alerts</span>
          </NavLink>
        </nav>

        <div className="mt-auto px-3 py-3 border-top border-secondary">
          <button
            className="btn btn-sm btn-outline-light w-100 d-flex align-items-center justify-content-center"
            onClick={() => setCollapsed(!collapsed)}
            aria-pressed={collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i className={`bi ${collapsed ? "bi-layout-sidebar-inset" : "bi-layout-sidebar"}`} aria-hidden="true" />
            <span className="ms-2 sidebar-label">{collapsed ? "Expand" : "Collapse"}</span>
          </button>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex-grow-1 d-flex flex-column">
        <header className="topbar" aria-label="Top bar">
          <div className="d-flex align-items-center justify-content-between px-3 py-2">
            {/* Environment badge */}
            <span className="badge bg-secondary">{env ? env.name : "Environment"}</span>

            <div className="d-flex align-items-center gap-2">
              <button className="btn btn-sm btn-outline-light">
                <i className="bi bi-bell" aria-hidden="true" /> <span className="sidebar-label">Notifications</span>
              </button>
              <button className="btn btn-sm btn-light" onClick={handleSignOut}>
                <i className="bi bi-box-arrow-right" aria-hidden="true" /> <span className="sidebar-label">Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <main className="p-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
