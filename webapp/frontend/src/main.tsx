// src/main.tsx
import { StrictMode, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";

import "bootstrap";
import "bootstrap-icons/font/bootstrap-icons.css";
import "bootstrap/dist/css/bootstrap.min.css";

// Global app styles (used for the authenticated application shell)
import "./App.css";

import App from "./App";

/**
 * ============================
 * Desktop-only gate settings
 * ============================
 *
 * 1024 blocks iPads/tablets in most cases and phones.
 * If you want to be even stricter, raise it (e.g. 1100).
 */
const MIN_DESKTOP_WIDTH = 1024;

/**
 * User-Agent detection (secondary signal)
 * - Helps catch iPads that report "Macintosh" but still include "Mobile"
 * - Helps catch obvious phones/tablets
 */
function isLikelyMobileOrTabletUA(): boolean {
  const ua = navigator.userAgent || "";
  return /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(ua);
}

/**
 * Touch capability (secondary signal)
 * - Not perfect (some laptops have touch screens)
 * - Combined with width to avoid blocking a desktop user just resizing their browser
 */
function hasTouch(): boolean {
  return "ontouchstart" in window || (navigator.maxTouchPoints ?? 0) > 0;
}

/**
 * Gate decision:
 * - Primary: screen is narrower than desktop breakpoint
 * - Secondary: device is touch-capable OR UA suggests mobile/tablet
 *
 * This combination blocks phones + iPads/tablets, while being lenient to desktops.
 */
function shouldBlockDevice(): boolean {
  const narrow = window.matchMedia(`(max-width: ${MIN_DESKTOP_WIDTH - 1}px)`).matches;
  const touch = hasTouch();
  const uaMobile = isLikelyMobileOrTabletUA();

  return narrow && (touch || uaMobile);
}

function DeviceNotSupported() {
  // We can compute once on render; the gate wrapper handles updates on resize.
  const message = useMemo(
    () => ({
      title: "Computers only",
      body: "BridgePoint is designed for laptops and desktop computers. Please open this app on a larger screen.",
      hint: "If you're on a tablet, this app is not supported at the moment.",
    }),
    []
  );

  return (
    <div
      className="d-flex align-items-center justify-content-center min-vh-100 p-3"
      style={{
        background: "var(--bs-body-bg)",
        color: "var(--bs-body-color)",
      }}
    >
      <div
        className="text-center p-4 rounded-3 border"
        style={{
          maxWidth: 560,
          width: "100%",
          background: "var(--bs-body-bg)",
          borderColor: "var(--bs-border-color)",
          boxShadow: "0 0.5rem 1.5rem rgba(0,0,0,0.08)",
        }}
      >
        <div
          className="rounded-circle d-inline-flex align-items-center justify-content-center mb-3"
          style={{
            width: 64,
            height: 64,
            background: "rgba(var(--bs-primary-rgb), 0.12)",
          }}
        >
          <i className="bi bi-laptop fs-2" aria-hidden="true" />
        </div>

        <h1 className="h4 fw-bold mb-2">{message.title}</h1>
        <p className="text-secondary mb-3" style={{ lineHeight: 1.5 }}>
          {message.body}
        </p>

        <div className="small text-secondary">{message.hint}</div>
      </div>
    </div>
  );
}

/**
 * Wrapper that decides whether to boot the app.
 * This avoids mounting the router/auth/etc on unsupported devices.
 */
function DesktopGate() {
  const [blocked, setBlocked] = useState<boolean>(() => shouldBlockDevice());

  useEffect(() => {
    const update = () => setBlocked(shouldBlockDevice());

    // Respond to resize/orientation changes
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return blocked ? <DeviceNotSupported /> : <App />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DesktopGate />
  </StrictMode>
);