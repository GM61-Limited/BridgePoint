
// src/pages/_layout.tsx
import { NavLink, Outlet } from "react-router-dom";

/**
 * Minimal app shell (layout) with a black sidebar and a content area.
 * Keep styles inline here to avoid creating extra files; you can move them into SCSS later.
 */
export default function Layout() {
  return (
    <div className="d-flex" style={{ minHeight: "100vh", background: "#0f1115" }}>
      {/* ---------- Sidebar ---------- */}
      <aside
        className="bg-dark text-white"
        style={{ width: 264, borderRight: "1px solid #23262b" }}
      >
        <div className="px-3 py-3 d-flex align-items-center border-bottom border-secondary">
          <i className="bi bi-hdd-stack fs-4 me-2" aria-hidden="true" />
          <span className="fw-semibold">BridgePoint</span>
        </div>

        <nav className="nav flex-column px-2 py-2" aria-label="Primary">
          <NavLink to="/" end className="nav-link text-white">
            <i className="bi bi-speedometer2 me-2" aria-hidden="true" />
            Home
          </NavLink>
          <NavLink to="/pipelines" className="nav-link text-white">
            <i className="bi bi-diagram-3 me-2" aria-hidden="true" />
            Pipelines
          </NavLink>
          <NavLink to="/connectors" className="nav-link text-white">
            <i className="bi bi-plug me-2" aria-hidden="true" />
            Connectors
          </NavLink>
          <NavLink to="/alerts" className="nav-link text-white">
            <i className="bi bi-bell me-2" aria-hidden="true" />
            Alerts
          </NavLink>
        </nav>
      </aside>

      {/* ---------- Main column ---------- */}
      <div className="flex-grow-1 d-flex flex-column">
        {/* Optional topbar; you can replace with your own component later */}
        <header
          className="border-bottom"
          style={{ background: "#0f1115" }}
          aria-label="Top bar"
        >
          <div className="d-flex align-items-center justify-content-between px-3 py-2">
            {/* Environment badge — your Home page can replace this with the real env name from /environment */}
            <span className="badge bg-secondary">UAT</span>

            <div className="d-flex align-items-center gap-3">
              <button className="btn btn-sm btn-outline-light">
                <i className="bi bi-bell" aria-hidden="true" /> Notifications
              </button>
              {/* User menu placeholder */}
              <div className="dropdown">
                <button
                  className="btn btn-sm btn-light dropdown-toggle"
                  data-bs-toggle="dropdown"
                  aria-expanded="false"
                >
                  User
                </button>
                <ul className="dropdown-menu dropdown-menu-end">
                  <li><button className="dropdown-item">Profile</button></li>
                  <li><button className="dropdown-item">Sign out</button></li>
                </ul>
              </div>
            </div>
          </div>
        </header>

        {/* Route content renders here */}
        <main className="p-3">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
