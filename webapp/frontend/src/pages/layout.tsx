// src/pages/layout.tsx
import React, { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";
import { useModules } from "../features/modules/ModulesContext";

type Theme = "system" | "light" | "dark";
const THEME_KEY = "bp_theme";

/** Resolve the actual theme (light/dark) from a logical theme */
function resolveTheme(t: Theme): "light" | "dark" {
  if (t === "system") {
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return t;
}

/** Apply theme to the document (Bootstrap 5.3 color modes) */
function applyTheme(t: Theme) {
  const actual = resolveTheme(t);
  document.documentElement.setAttribute("data-bs-theme", actual);
}

export default function Layout() {
  const { logout } = useAuth(); // logout does hard refresh
  const { environment, isEnabled, loading: modulesLoading, error: modulesError } = useModules();

  const [collapsed, setCollapsed] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // --- Theme state ---
  const [theme, setTheme] = useState<Theme>(() => {
    const saved = (localStorage.getItem(THEME_KEY) as Theme) || "system";
    return saved === "light" || saved === "dark" || saved === "system" ? saved : "system";
  });

  // Apply theme on mount and whenever it changes
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  // React to OS theme changes when in "system" mode
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return;

    const onChange = () => {
      if (theme === "system") applyTheme("system");
    };

    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [theme]);

  // ---- Sign out handler ----
  async function handleSignOut() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout(); // hard refresh to /login
    } catch {
      setSigningOut(false);
    }
  }

  // Button outlines should contrast in both themes
  const actualTheme = resolveTheme(theme);
  const btnOutline = actualTheme === "dark" ? "btn-outline-light" : "btn-outline-dark";

  // Toggle handler:
  // - normal click: flip light <-> dark based on the actual theme
  // - Alt+click: reset to system (follow OS)
  function handleThemeToggle(e: React.MouseEvent<HTMLButtonElement>) {
    if (e.altKey) {
      setTheme("system");
      return;
    }
    const next = actualTheme === "dark" ? "light" : "dark";
    setTheme(next);
  }

  // Icon reflects the current actual theme
  const iconClass = actualTheme === "dark" ? "bi-sun" : "bi-moon";
  const toggleTitle =
    actualTheme === "dark"
      ? "Switch to light (Alt: follow system)"
      : "Switch to dark (Alt: follow system)";

  // -------------------------
  // Module visibility flags
  // -------------------------
  const showMachineMonitoring = isEnabled("machine-monitoring");
  const showIntegrationHub = isEnabled("integration-hub");
  const showAnalytics = isEnabled("analytics");
  const showFinance = isEnabled("finance");

  // Alerts are part of machine monitoring ✅ (your decision)
  const showAlerts = showMachineMonitoring;

  // What should the environment badge show?
  const envLabel = modulesLoading ? "Environment" : environment?.name ? environment.name : "Environment";

  return (
    <div className={`app-shell d-flex ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* ---------- Sidebar ---------- */}
      <aside className="sidebar">
        <div className="px-3 py-3 d-flex align-items-center border-bottom">
          <i className="bi bi-hdd-stack fs-4 me-2" aria-hidden="true" />
          <span className="fw-semibold sidebar-label">BridgePoint</span>
        </div>

        <nav className="nav flex-column px-2 py-2" aria-label="Primary">
          {/* Home (core) */}
          <NavLink
            to="/home"
            end
            className={({ isActive }) => `nav-link d-flex align-items-center ${isActive ? "active" : ""}`}
          >
            <i className="bi bi-house-door me-2" aria-hidden="true" />
            <span className="sidebar-label">Home</span>
          </NavLink>

          {/* -------- Machine Monitoring -------- */}
          {showMachineMonitoring && (
            <>
              <div className="px-3 pt-3 pb-1 text-secondary small" style={{ opacity: 0.9 }}>
                MACHINE MONITORING
              </div>

              {/* Machines (overview/list) */}
              <NavLink
                to="/machines"
                className={({ isActive }) =>
                  `nav-link d-flex align-items-center justify-content-between ${isActive ? "active" : ""}`
                }
              >
                <span className="d-flex align-items-center">
                  <i className="bi bi-hdd-stack me-2" aria-hidden="true" />
                  <span className="sidebar-label">Machines</span>
                </span>
              </NavLink>

              {/* Cycles */}
              <NavLink
                to="/wash-cycles"
                className={({ isActive }) =>
                  `nav-link d-flex align-items-center justify-content-between ${isActive ? "active" : ""}`
                }
              >
                <span className="d-flex align-items-center">
                  <i className="bi bi-arrow-repeat me-2" aria-hidden="true" />
                  <span className="sidebar-label">Cycles</span>
                </span>
              </NavLink>

              {/* Upload cycles */}
              <NavLink
                to="/wash-cycles/upload"
                className={({ isActive }) =>
                  `nav-link d-flex align-items-center justify-content-between ${isActive ? "active" : ""}`
                }
              >
                <span className="d-flex align-items-center">
                  <i className="bi bi-upload me-2" aria-hidden="true" />
                  <span className="sidebar-label">Upload cycles</span>
                </span>
              </NavLink>

              {/* Alerts */}
              {showAlerts && (
                <NavLink
                  to="/alerts"
                  className={({ isActive }) =>
                    `nav-link d-flex align-items-center justify-content-between ${isActive ? "active" : ""}`
                  }
                >
                  <span className="d-flex align-items-center">
                    <i className="bi bi-bell me-2" aria-hidden="true" />
                    <span className="sidebar-label">Alerts</span>
                  </span>
                </NavLink>
              )}

              {/* ---------------------------------------------------------
                  Future: Performance / Overview / Statistics
                  Add this later when you build the page/route.
                  ---------------------------------------------------------
              <NavLink
                to="/performance"
                className={({ isActive }) =>
                  `nav-link d-flex align-items-center justify-content-between ${isActive ? "active" : ""}`
                }
              >
                <span className="d-flex align-items-center">
                  <i className="bi bi-graph-up me-2" aria-hidden="true" />
                  <span className="sidebar-label">Performance</span>
                </span>
              </NavLink>
              */}
            </>
          )}

          {/* -------- Integration Hub -------- */}
          {showIntegrationHub && (
            <>
              <div className="px-3 pt-3 pb-1 text-secondary small" style={{ opacity: 0.9 }}>
                INTEGRATION HUB
              </div>

              <NavLink
                to="/pipelines"
                className={({ isActive }) =>
                  `nav-link d-flex align-items-center justify-content-between ${isActive ? "active" : ""}`
                }
              >
                <span className="d-flex align-items-center">
                  <i className="bi bi-diagram-3 me-2" aria-hidden="true" />
                  <span className="sidebar-label">Pipelines</span>
                </span>
              </NavLink>

              <NavLink
                to="/connectors"
                className={({ isActive }) =>
                  `nav-link d-flex align-items-center justify-content-between ${isActive ? "active" : ""}`
                }
              >
                <span className="d-flex align-items-center">
                  <i className="bi bi-plug me-2" aria-hidden="true" />
                  <span className="sidebar-label">Connectors</span>
                </span>
              </NavLink>
            </>
          )}

          {/* -------- Analytics -------- */}
          {showAnalytics && (
            <>
              <div className="px-3 pt-3 pb-1 text-secondary small" style={{ opacity: 0.9 }}>
                ANALYTICS
              </div>

              <NavLink
                to="/dashboards"
                className={({ isActive }) =>
                  `nav-link d-flex align-items-center justify-content-between ${isActive ? "active" : ""}`
                }
              >
                <span className="d-flex align-items-center">
                  <i className="bi bi-bar-chart-line me-2" aria-hidden="true" />
                  <span className="sidebar-label">Dashboards</span>
                </span>
              </NavLink>
            </>
          )}

          {/* -------- Finance -------- */}
          {showFinance && (
            <>
              <div className="px-3 pt-3 pb-1 text-secondary small" style={{ opacity: 0.9 }}>
                FINANCE
              </div>

              <NavLink
                to="/finance"
                className={({ isActive }) =>
                  `nav-link d-flex align-items-center justify-content-between ${isActive ? "active" : ""}`
                }
              >
                <span className="d-flex align-items-center">
                  <i className="bi bi-currency-pound me-2" aria-hidden="true" />
                  <span className="sidebar-label">Finance</span>
                </span>
              </NavLink>
            </>
          )}

          {/* Settings (core) */}
          <div className="px-3 pt-3 pb-1 text-secondary small" style={{ opacity: 0.9 }}>
            CORE
          </div>

          <NavLink
            to="/settings"
            className={({ isActive }) => `nav-link d-flex align-items-center ${isActive ? "active" : ""}`}
          >
            <i className="bi bi-gear me-2" aria-hidden="true" />
            <span className="sidebar-label">Settings</span>
          </NavLink>

          {/* Optional: show a tiny warning if modules failed to load */}
          {modulesError && (
            <div className="px-3 pt-2 text-warning small">
              <i className="bi bi-exclamation-triangle me-1" aria-hidden="true" />
              Module config failed to load
            </div>
          )}
        </nav>

        <div className="mt-auto px-3 py-3 border-top">
          <button
            className="btn btn-sm btn-outline-secondary w-100 d-flex align-items-center justify-content-center"
            onClick={() => setCollapsed(!collapsed)}
            aria-pressed={collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <i
              className={`bi ${collapsed ? "bi-layout-sidebar-inset" : "bi-layout-sidebar"}`}
              aria-hidden="true"
            />
            <span className="ms-2 sidebar-label">{collapsed ? "Expand" : "Collapse"}</span>
          </button>
        </div>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex-grow-1 d-flex flex-column">
        <header className="topbar" aria-label="Top bar">
          <div className="d-flex align-items-center justify-content-between px-3 py-2">
            {/* Environment badge */}
            <span className="badge bg-secondary">{envLabel}</span>

            <div className="d-flex align-items-center gap-2">
              {/* Notifications (placeholder) */}
              <button className={`btn btn-sm ${btnOutline}`}>
                <i className="bi bi-bell" aria-hidden="true" />{" "}
                <span className="sidebar-label">Notifications</span>
              </button>

              {/* Theme toggle */}
              <button
                type="button"
                className={`btn btn-sm ${btnOutline}`}
                onClick={handleThemeToggle}
                title={toggleTitle}
                aria-label="Toggle color mode"
              >
                <i className={`bi ${iconClass}`} aria-hidden="true" />
              </button>

              {/* Sign out */}
              <button
                className="btn btn-sm btn-primary"
                onClick={handleSignOut}
                disabled={signingOut}
                aria-label="Sign out"
                title="Sign out"
              >
                {signingOut ? (
                  <>
                    <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true" />
                    <span className="sidebar-label">Signing out…</span>
                  </>
                ) : (
                  <>
                    <i className="bi bi-box-arrow-right" aria-hidden="true" />{" "}
                    <span className="sidebar-label">Sign out</span>
                  </>
                )}
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