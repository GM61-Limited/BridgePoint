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

  // ✅ Notifications drawer state
  const [showNotifications, setShowNotifications] = useState(false);

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

  // What should the environment badge show?
  const envLabel = modulesLoading ? "Environment" : environment?.name ? environment.name : "Environment";

  // ✅ Close notifications on ESC
  useEffect(() => {
    if (!showNotifications) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowNotifications(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showNotifications]);

  // ✅ Nice helper: consistent nav classes + collapsed behavior
  function navClass(isActive: boolean) {
    return [
      "nav-link",
      "d-flex",
      "align-items-center",
      collapsed ? "justify-content-center" : "",
      isActive ? "active" : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  // ✅ Helper: icon spacing only when expanded
  function iconCls(base: string) {
    return `bi ${base} ${collapsed ? "" : "me-2"}`;
  }

  return (
    <div className={`app-shell d-flex ${collapsed ? "sidebar-collapsed" : ""}`}>
      {/* ---------- Sidebar ---------- */}
      <aside className="sidebar">
        <div className="px-3 py-3 d-flex align-items-center border-bottom">
          <i className={iconCls("bi-hdd-stack fs-4")} aria-hidden="true" />
          <span className="fw-semibold sidebar-label">BridgePoint</span>
        </div>

        <nav className="nav flex-column px-2 py-2" aria-label="Primary">
          {/* Home */}
          <NavLink
            to="/home"
            end
            title={collapsed ? "Home" : undefined}
            className={({ isActive }) => navClass(isActive)}
          >
            <i className={iconCls("bi-house-door")} aria-hidden="true" />
            <span className="sidebar-label">Home</span>
          </NavLink>

          {/* -------- Machine Monitoring -------- */}
          {showMachineMonitoring && (
            <>
              {/* ✅ Hide section titles when collapsed */}
              {!collapsed && (
                <div className="px-3 pt-3 pb-1 text-secondary small" style={{ opacity: 0.9 }}>
                  MACHINE MONITORING
                </div>
              )}

              {/* Machines (overview/list) */}
              <NavLink
                to="/machines"
                end
                title={collapsed ? "Machines" : undefined}
                className={({ isActive }) => navClass(isActive)}
              >
                <i className={iconCls("bi-hdd-stack")} aria-hidden="true" />
                <span className="sidebar-label">Machines</span>
              </NavLink>

              {/* Dashboard */}
              <NavLink
                to="/machines/dashboard"
                end
                title={collapsed ? "Dashboard" : undefined}
                className={({ isActive }) => navClass(isActive)}
              >
                <i className={iconCls("bi-graph-up")} aria-hidden="true" />
                <span className="sidebar-label">Dashboard</span>
              </NavLink>

              {/* Health */}
              <NavLink
                to="/machines/health"
                end
                title={collapsed ? "Health" : undefined}
                className={({ isActive }) => navClass(isActive)}
              >
                <i className={iconCls("bi-heart-pulse")} aria-hidden="true" />
                <span className="sidebar-label">Health</span>
              </NavLink>

              {/* Cycles */}
              {/* NOTE: we intentionally DO NOT use `end` here,
                 so Cycles stays highlighted for /wash-cycles/:id and /wash-cycles/upload */}
              <NavLink
                to="/wash-cycles"
                title={collapsed ? "Cycles" : undefined}
                className={({ isActive }) => navClass(isActive)}
              >
                <i className={iconCls("bi-arrow-repeat")} aria-hidden="true" />
                <span className="sidebar-label">Cycles</span>
              </NavLink>
            </>
          )}

          {/* -------- Integration Hub -------- */}
          {showIntegrationHub && (
            <>
              {!collapsed && (
                <div className="px-3 pt-3 pb-1 text-secondary small" style={{ opacity: 0.9 }}>
                  INTEGRATION HUB
                </div>
              )}

              <NavLink
                to="/pipelines"
                title={collapsed ? "Pipelines" : undefined}
                className={({ isActive }) => navClass(isActive)}
              >
                <i className={iconCls("bi-diagram-3")} aria-hidden="true" />
                <span className="sidebar-label">Pipelines</span>
              </NavLink>

              <NavLink
                to="/connectors"
                title={collapsed ? "Connectors" : undefined}
                className={({ isActive }) => navClass(isActive)}
              >
                <i className={iconCls("bi-plug")} aria-hidden="true" />
                <span className="sidebar-label">Connectors</span>
              </NavLink>
            </>
          )}

          {/* -------- Analytics -------- */}
          {showAnalytics && (
            <>
              {!collapsed && (
                <div className="px-3 pt-3 pb-1 text-secondary small" style={{ opacity: 0.9 }}>
                  ANALYTICS
                </div>
              )}

              <NavLink
                to="/dashboards"
                title={collapsed ? "Dashboards" : undefined}
                className={({ isActive }) => navClass(isActive)}
              >
                <i className={iconCls("bi-bar-chart-line")} aria-hidden="true" />
                <span className="sidebar-label">Dashboards</span>
              </NavLink>
            </>
          )}

          {/* -------- Finance -------- */}
          {showFinance && (
            <>
              {!collapsed && (
                <div className="px-3 pt-3 pb-1 text-secondary small" style={{ opacity: 0.9 }}>
                  FINANCE
                </div>
              )}

              <NavLink
                to="/finance"
                title={collapsed ? "Finance" : undefined}
                className={({ isActive }) => navClass(isActive)}
              >
                <i className={iconCls("bi-currency-pound")} aria-hidden="true" />
                <span className="sidebar-label">Finance</span>
              </NavLink>
            </>
          )}

          {/* -------- Core -------- */}
          {!collapsed && (
            <div className="px-3 pt-3 pb-1 text-secondary small" style={{ opacity: 0.9 }}>
              CORE
            </div>
          )}

          <NavLink
            to="/settings"
            title={collapsed ? "Settings" : undefined}
            className={({ isActive }) => navClass(isActive)}
          >
            <i className={iconCls("bi-gear")} aria-hidden="true" />
            <span className="sidebar-label">Settings</span>
          </NavLink>

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
            title={collapsed ? "Expand" : "Collapse"}
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
            <span className="badge bg-secondary">{envLabel}</span>

            <div className="d-flex align-items-center gap-2">
              {/* Notifications (drawer trigger) */}
              <button
                type="button"
                className={`btn btn-sm ${btnOutline}`}
                onClick={() => setShowNotifications(true)}
                aria-haspopup="dialog"
                aria-expanded={showNotifications}
                aria-controls="notifications-drawer"
                title="Notifications"
              >
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

      {/* ==================================================
          Notifications Drawer (slide-over from right)
         ================================================== */}
      {showNotifications && (
        <>
          {/* Backdrop */}
          <div
            onClick={() => setShowNotifications(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.35)",
              zIndex: 1040,
            }}
            aria-hidden="true"
          />

          {/* Drawer panel */}
          <div
            id="notifications-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Notifications"
            style={{
              position: "fixed",
              top: 0,
              right: 0,
              height: "100vh",
              width: "min(420px, 92vw)",
              background: "var(--bs-body-bg)",
              borderLeft: "1px solid var(--bs-border-color)",
              zIndex: 1050,
              boxShadow: "0 0.5rem 1.5rem rgba(0,0,0,0.25)",
              display: "flex",
              flexDirection: "column",
              animation: "bp-slide-in-right 180ms ease-out",
            }}
          >
            <div className="d-flex align-items-center justify-content-between px-3 py-3 border-bottom">
              <div className="d-flex align-items-center gap-2">
                <i className="bi bi-bell" aria-hidden="true" />
                <div className="fw-semibold">Notifications</div>
              </div>

              <button
                type="button"
                className="btn btn-sm btn-outline-secondary"
                onClick={() => setShowNotifications(false)}
                aria-label="Close notifications"
                title="Close"
              >
                <i className="bi bi-x-lg" aria-hidden="true" />
              </button>
            </div>

            <div className="p-3" style={{ overflowY: "auto", flex: "1 1 auto" }}>
              <div className="text-center py-5">
                <div
                  className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3"
                  style={{
                    width: 56,
                    height: 56,
                    background: "rgba(var(--bs-secondary-rgb), 0.15)",
                  }}
                >
                  <i className="bi bi-check2-circle fs-3 text-secondary" aria-hidden="true" />
                </div>

                <div className="fw-semibold">No new notifications</div>
                <div className="text-secondary small mt-1">
                  You’re all caught up. Failed cycles and important events will appear here.
                </div>
              </div>

              <div className="text-secondary small">
                <div className="fw-semibold mb-2">Coming soon</div>
                <ul className="mb-0">
                  <li>Cycle failure notifications</li>
                  <li>Repeated failure escalation</li>
                  <li>Machine inactivity hints</li>
                </ul>
              </div>
            </div>

            <div className="px-3 py-3 border-top">
              <button
                type="button"
                className="btn btn-outline-secondary btn-sm w-100"
                onClick={() => setShowNotifications(false)}
              >
                Close
              </button>
            </div>
          </div>

          <style>
            {`
              @keyframes bp-slide-in-right {
                from { transform: translateX(12px); opacity: 0; }
                to { transform: translateX(0); opacity: 1; }
              }
            `}
          </style>
        </>
      )}
    </div>
  );
}