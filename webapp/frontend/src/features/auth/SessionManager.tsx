// src/features/auth/SessionManager.tsx
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

/**
 * Inactivity policy:
 * - warn after 10 minutes inactivity
 * - logout after 15 minutes inactivity
 */
const WARN_AFTER_MS = 10 * 60 * 1000;
const LOGOUT_AFTER_MS = 15 * 60 * 1000;

function formatCountdown(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function SessionManager() {
  const { pathname } = useLocation();
  const { isAuthenticated, logout } = useAuth();

  const [showWarning, setShowWarning] = useState(false);
  const [remainingMs, setRemainingMs] = useState<number>(LOGOUT_AFTER_MS);

  const lastActivityRef = useRef<number>(Date.now());
  const warnedRef = useRef<boolean>(false);
  const tickTimerRef = useRef<number | null>(null);

  const isLoginRoute = useMemo(() => pathname === "/login", [pathname]);

  const markActivity = () => {
    lastActivityRef.current = Date.now();
    warnedRef.current = false;
    setShowWarning(false);
    setRemainingMs(LOGOUT_AFTER_MS);
  };

  useEffect(() => {
    // Only run when logged in and not on the login page
    if (!isAuthenticated || isLoginRoute) return;

    // Throttle noisy events like mousemove
    let rafPending = false;
    const onActivity = () => {
      if (rafPending) return;
      rafPending = true;
      requestAnimationFrame(() => {
        rafPending = false;
        markActivity();
      });
    };

    const events: (keyof WindowEventMap)[] = [
      "mousemove",
      "mousedown",
      "keydown",
      "scroll",
      "touchstart",
      "click",
    ];

    events.forEach((evt) => window.addEventListener(evt, onActivity, { passive: true }));

    return () => {
      events.forEach((evt) => window.removeEventListener(evt, onActivity as any));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, isLoginRoute]);

  useEffect(() => {
    if (!isAuthenticated || isLoginRoute) return;

    // Tick loop: checks inactivity and updates countdown UI
    const tick = async () => {
      const now = Date.now();
      const inactiveFor = now - lastActivityRef.current;

      // Show warning at WARN_AFTER_MS
      if (inactiveFor >= WARN_AFTER_MS && inactiveFor < LOGOUT_AFTER_MS) {
        if (!warnedRef.current) {
          warnedRef.current = true;
          setShowWarning(true);
        }
        setRemainingMs(LOGOUT_AFTER_MS - inactiveFor);
      } else if (inactiveFor < WARN_AFTER_MS) {
        // Active again
        if (showWarning) setShowWarning(false);
        setRemainingMs(LOGOUT_AFTER_MS);
      }

      // Logout at LOGOUT_AFTER_MS
      if (inactiveFor >= LOGOUT_AFTER_MS) {
        // Hard logout -> redirects to /login via AuthContext
        try {
          await logout();
        } catch {
          // ignore, AuthContext logout handles cleanup
        }
      }
    };

    // 1s interval is fine for countdown
    tickTimerRef.current = window.setInterval(() => {
      void tick();
    }, 1000);

    return () => {
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    };
  }, [isAuthenticated, isLoginRoute, logout, showWarning]);

  if (!isAuthenticated || isLoginRoute) return null;

  if (!showWarning) return null;

  const countdownText = formatCountdown(remainingMs);

  return (
    <div
      className="position-fixed top-0 start-0 w-100 h-100"
      style={{
        zIndex: 2000,
        background: "rgba(0,0,0,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      role="dialog"
      aria-modal="true"
      aria-label="Session timeout warning"
    >
      <div
        className="bg-white rounded shadow p-4"
        style={{ width: "min(520px, 100%)" }}
      >
        <h5 className="mb-2">You’re about to be logged out</h5>
        <p className="mb-3 text-muted">
          You’ve been inactive. For security, BridgePoint will log you out in{" "}
          <strong>{countdownText}</strong>.
        </p>

        <div className="d-flex gap-2 justify-content-end">
          <button
            type="button"
            className="btn btn-outline-secondary"
            onClick={() => void logout()}
          >
            Log out now
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => markActivity()}
          >
            Stay signed in
          </button>
        </div>
      </div>
    </div>
  );
}