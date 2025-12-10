
// src/App.tsx
import { type ReactNode, useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";

import LoginPage from "./pages/LoginPage";
import Home from "./pages/home";
import Layout from "./pages/layout";

/** Sync body class with current route so login/app backgrounds don't leak */
function BodyClassSync() {
  const { pathname } = useLocation();
  useEffect(() => {
    const isLogin = pathname === "/login";
    document.body.classList.toggle("login-view", isLogin);
    document.body.classList.toggle("app-view", !isLogin);

    return () => {
      document.body.classList.remove("login-view", "app-view");
    };
  }, [pathname]);
  return null;
}

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

  // Fallback to token presence if isAuthenticated is ever undefined
  const authed = Boolean(isAuthenticated || token);
  return authed ? <>{children}</> : <Navigate to="/login" replace state={{ from: location }} />;
}

/** Guard: if already authenticated, don’t show the login page—go to /home */
function AnonOnlyRoute({ children }: { children?: ReactNode }) {
  const { isAuthenticated, bootstrapping, token } = useAuth();

  if (bootstrapping) return <FullPageSpinner />;

  const authed = Boolean(isAuthenticated || token);
  return authed ? <Navigate to="/home" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Route-aware body class switcher */}
        <BodyClassSync />

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
            {/* Redirect the shell's index to the canonical Home route */}
            <Route index element={<Navigate to="/home" replace />} />

            {/* Named Home route so the URL is localhost/home */}
            <Route path="home" element={<Home />} />

            {/* Future protected pages (examples) */}
            {/* <Route path="pipelines" element={<Pipelines />} /> */}
            {/* <Route path="connectors" element={<Connectors />} /> */}
            {/* <Route path="alerts" element={<Alerts />} /> */}
          </Route>

          {/* Catch-all → canonical root */}
          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
