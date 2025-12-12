
// src/App.tsx
import { type ReactNode, useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";

import Home from "./pages/home";
import Layout from "./pages/layout";
import LoginPage from "./pages/LoginPage";
import ReprocessingMonitor from "./pages/ReprocessingMonitor"; // <-- ADD: washers/autoclaves/sterilisers module
import Settings from "./pages/settings"; // <-- NEW

/**
 * Sync body class with the current route, but only after auth bootstrapping.
 * This avoids background/style flicker during initialisation.
 */
function BodyClassSync() {
  const { pathname } = useLocation();
  const { bootstrapping } = useAuth();

  useEffect(() => {
    if (bootstrapping) return; // don't toggle while we don't know auth

    const isLogin = pathname === "/login";
    document.body.classList.toggle("login-view", isLogin);
    document.body.classList.toggle("app-view", !isLogin);

    return () => {
      document.body.classList.remove("login-view", "app-view");
    };
  }, [pathname, bootstrapping]);

  return null;
}

/** Simple full-page spinner shown while auth bootstraps */
function FullPageSpinner() {
  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: "100vh" }}
    >
      <div
        className="spinner-border text-light"
        role="status"
        aria-label="Loading"
      />
    </div>
  );
}

/**
 * Guard: only allow access when authenticated; otherwise, send to /login.
 * Uses `replace` to prevent the back button returning to login after success.
 */
function ProtectedRoute({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, bootstrapping } = useAuth();

  if (bootstrapping) return <FullPageSpinner />;

  return isAuthenticated ? (
    <>{children}</>
  ) : (
    <Navigate to="/login" replace state={{ from: location }} />
  );
}

/**
 * Guard: if already authenticated, don’t show the login page—go to the app.
 * Uses `replace` so login isn’t left in history.
 */
function AnonOnlyRoute({ children }: { children?: ReactNode }) {
  const { isAuthenticated, bootstrapping } = useAuth();

  if (bootstrapping) return <FullPageSpinner />;

  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        {/* Route-aware body class switcher, gated by bootstrapping */}
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
            {/* Render Home at the shell index to avoid an extra redirect */}
            <Route index element={<Home />} />

            {/* Optional alias: users can still visit /home */}
            <Route path="home" element={<Home />} />

            {/* Settings (protected) */}
            <Route path="settings" element={<Settings />} />

            {/* Reprocessing Monitor (washers/autoclaves/sterilisers) */}
            <Route path="reprocessing" element={<ReprocessingMonitor />} />
            {/* Convenience alias: /washers goes to the same view */}
            <Route path="washers" element={<ReprocessingMonitor />} />

            {/* Future protected pages (examples) */}
            {/* <Route path="pipelines" element={<Pipelines />} /> */}
            {/* <Route path="connectors" element={<Connectors />} /> */}
            {/* <Route path="alerts" element={<Alerts />} /> */}
          </Route>

          {/* Catch-all → canonical root; ProtectedRoute will decide */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
