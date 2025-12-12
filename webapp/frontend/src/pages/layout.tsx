
// src/pages/layout.tsx
import React, { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

/** Dev: http://localhost:8000 ; Prod: /api behind Nginx */
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";

type EnvironmentResponse = { id: number; name: string; domain: string };
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
  const { token, logout } = useAuth(); // token for /environment; logout does hard refresh
  const [collapsed, setCollapsed] = useState(false);
  const [env, setEnv] = useState<EnvironmentResponse | null>(null);
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

  // Environment badge fetch (runs when token is available/changes)
  useEffect(() => {
    const abort = new AbortController();
    async function loadEnv() {
      try {
        if (!token) return;
        const res = await fetch(`${API_BASE}/environment`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: abort.signal,
        });
        if (res.ok) setEnv(await res.json());
      } catch {
        // ignore network/API errors for the badge
      }
    }
    loadEnv();
    return () => abort.abort();
  }, [token]);

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
    actualTheme === "dark" ? "Switch to light (Alt: follow system)" : "Switch to dark (Alt: follow system)";

  return (
    <div className={`app-shell d-flex ${collapsed ? "sidebar-collapsed" : ""}`}>

      {/* ---------- Sidebar ---------- */}
      <aside className="sidebar">
        <div className="px-3 py-3 d-flex align-items-center border-bottom">
          <i className="bi bi-hdd-stack fs-4 me-2" aria-hidden="true" />
          <span className="fw-semibold sidebar-label">BridgePoint</span>
        </div>

        <nav className="nav flex-column px-2 py-2" aria-label="Primary">
          {/* Home (house icon) */}
          <NavLink
            to="/home"
            end
            className={({ isActive }) =>
              `nav-link d-flex align-items-center ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-house-door me-2" aria-hidden="true" />
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

          {/* Washers (washers/autoclaves/sterilisers module entry) */}
          <NavLink
            to="/washers"
            className={({ isActive }) =>
              `nav-link d-flex align-items-center ${isActive ? "active" : ""}`
            }
          >
            {/* Use a widely available icon for maximum compatibility */}
            <i className="bi bi-droplet me-2" aria-hidden="true" />
            <span className="sidebar-label">Washers</span>
          </NavLink>

          {/* Settings */}
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              `nav-link d-flex align-items-center ${isActive ? "active" : ""}`
            }
          >
            <i className="bi bi-gear me-2" aria-hidden="true" />
            <span className="sidebar-label">Settings</span>
          </NavLink>
        </nav>

        <div className="mt-auto px-3 py-3 border-top">
          <button
            className="btn btn-sm btn-outline-secondary w-100 d-flex align-items-center justify-content-center"
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
              {/* Notifications */}
              <button className={`btn btn-sm ${btnOutline}`}>
                <i className="bi bi-bell" aria-hidden="true" /> <span className="sidebar-label">Notifications</span>
              </button>

              {/* Single theme toggle button (sun/moon only) */}
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
