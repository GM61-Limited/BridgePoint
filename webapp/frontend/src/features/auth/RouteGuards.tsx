
// src/features/auth/RouteGuards.tsx
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";

export function RequireAuth() {
  const { bootstrapping, isAuthenticated } = useAuth();
  const location = useLocation();

  // Hold routing until auth bootstrap completes — prevents flicker
  if (bootstrapping) return <div className="auth-loader">Loading…</div>;

  return isAuthenticated
    ? <Outlet />
    : <Navigate to="/login" state={{ from: location }} replace />;
}

export function RequireGuest() {
  const { bootstrapping, isAuthenticated } = useAuth();
  const location = useLocation();

  if (bootstrapping) return <div className="auth-loader">Loading…</div>;

  return isAuthenticated
    ? <Navigate to={location.state?.from?.pathname ?? "/"} replace />
    : <Outlet />;
}
