
// src/pages/UnderConstruction.tsx
import { NavLink, useLocation, useNavigate } from "react-router-dom";

type UnderConstructionProps = {
  /** Optional explicit title. If omitted, a title will be derived from the URL path. */
  title?: string;
  /** Optional custom description. If omitted, a friendly default message is shown. */
  description?: string;
};

function titleFromPath(pathname: string) {
  // Take the last non-empty segment and title-case it
  const parts = pathname.split("/").filter(Boolean);
  const last = parts[parts.length - 1] || "Page";
  return last
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

export default function UnderConstruction({
  title,
  description,
}: UnderConstructionProps) {
  const location = useLocation();
  const navigate = useNavigate();

  const derivedTitle = title ?? titleFromPath(location.pathname);
  const desc =
    description ??
    "This page is under construction. We’re wiring things up behind the scenes—check back soon.";

  return (
    <div className="container-xxl py-4">
      <div className="d-flex align-items-center justify-content-between mb-3">
        <h2 className="m-0">{derivedTitle}</h2>
        <span className="text-muted small">Route: {location.pathname}</span>
      </div>

      <div className="card">
        <div className="card-header d-flex align-items-center gap-2">
          {/* Construction/Tools icon (widely available in Bootstrap Icons) */}
          <i className="bi bi-tools" aria-hidden="true" />
          <strong>Under construction</strong>
        </div>

        <div className="card-body">
          <p className="mb-3">{desc}</p>

          <div className="row g-2">
            <div className="col-auto">
              <button
                className="btn btn-outline-secondary"
                onClick={() => navigate(-1)}
              >
                <i className="bi bi-arrow-left" aria-hidden="true" /> Go back
              </button>
            </div>
            <div className="col-auto">
              <NavLink to="/home" className="btn btn-outline-primary">
                <i className="bi bi-house-door" aria-hidden="true" /> Home
              </NavLink>
            </div>
            <div className="col-auto">
              <NavLink to="/washers" className="btn btn-outline-primary">
                <i className="bi bi-droplet" aria-hidden="true" /> Washers
              </NavLink>
            </div>
            <div className="col-auto">
              <NavLink to="/settings" className="btn btn-outline-primary">
                <i className="bi bi-gear" aria-hidden="true" /> Settings
              </NavLink>
            </div>
          </div>

          <div className="text-muted small mt-3">
            Tip: You can reuse this component for any unfinished route by passing
            a custom <code>title</code> and/or <code>description</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
