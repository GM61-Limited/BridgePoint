
// src/App.tsx
import { type ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";

import LoginPage from "./pages/LoginPage";
import Home from "./pages/home";
import Layout from "./pages/layout";

/** Simple full-page spinner to show while auth bootstraps */
function FullPageSpinner() {
  return (
    <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "100vh" }}>
      <div className="spinner-border text-light" role="status" aria-label="Loading" />
    </div>
  );
}

/** Guard: only allow access when authenticated; otherwise, send to /login */
function ProtectedRoute({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, bootstrapping, token } = useAuth();

  if (bootstrapping) return <FullPageSpinner />;

  // If your context ever returns undefined, fall back to token presence
  const authed = Boolean(isAuthenticated || token);
  return authed ? <>{children}</> : <Navigate to="/login" replace state={{ from: location }} />;
}

/** Guard: if already authenticated, don’t show the login page—go to / */
function AnonOnlyRoute({ children }: { children?: ReactNode }) {
  const { isAuthenticated, bootstrapping, token } = useAuth();

  if (bootstrapping) return <FullPageSpinner />;

  const authed = Boolean(isAuthenticated || token);
  return authed ? <Navigate to="/" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* LOGIN (standalone, not wrapped by Layout) */}
          <Route
            path="/login"
            element={
              <AnonOnlyRoute>
                <LoginPage />
              </AnonOnlyRoute>
            }
          />

          {/* APP SHELL (Layout wraps only authenticated pages) */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            {/* Landing page after login */}
            <Route index element={<Home />} />

            {/* Future protected pages (examples) */}
            {/* <Route path="pipelines" element={<Pipelines />} /> */}
            {/* <Route path="connectors" element={<Connectors />} /> */}
            {/* <Route path="alerts" element={<Alerts />} /> */}
          </Route>

          {/* Catch-all → app root */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
