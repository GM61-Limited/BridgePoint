
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
import Settings from "./pages/settings";
import UnderConstruction from "./pages/UnderConstruction";

// Washers module pages
import DeviceDetail from "./pages/DeviceDetail";
import UploadCycle from "./pages/UploadCycle";
import WashCycles from "./pages/WashCycles";
import WashersOverview from "./pages/WashersOverview";

// Connectors
import Connectors from "./pages/connectors";

// Pipelines
import Pipelines from "./pages/pipelines";

// ⭐ NEW — Real Dashboards page
import Dashboards from "./pages/dashboards";


function BodyClassSync() {
  const { pathname } = useLocation();
  const { bootstrapping } = useAuth();

  useEffect(() => {
    if (bootstrapping) return;

    const isLogin = pathname === "/login";
    document.body.classList.toggle("login-view", isLogin);
    document.body.classList.toggle("app-view", !isLogin);

    return () => {
      document.body.classList.remove("login-view", "app-view");
    };
  }, [pathname, bootstrapping]);

  return null;
}

function FullPageSpinner() {
  return (
    <div
      className="d-flex align-items-center justify-content-center"
      style={{ minHeight: "100vh" }}
    >
      <div className="spinner-border text-primary" role="status" />
    </div>
  );
}

function ProtectedRoute({ children }: { children?: ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, bootstrapping } = useAuth();
  if (bootstrapping) return <FullPageSpinner />;
  return isAuthenticated
    ? <>{children}</>
    : <Navigate to="/login" replace state={{ from: location }} />;
}

function AnonOnlyRoute({ children }: { children?: ReactNode }) {
  const { isAuthenticated, bootstrapping } = useAuth();
  if (bootstrapping) return <FullPageSpinner />;
  return isAuthenticated ? <Navigate to="/" replace /> : <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <BodyClassSync />
        <Routes>

          {/* Login */}
          <Route
            path="/login"
            element={
              <AnonOnlyRoute>
                <LoginPage />
              </AnonOnlyRoute>
            }
          />

          {/* App */}
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Home />} />
            <Route path="home" element={<Home />} />

            <Route path="settings" element={<Settings />} />

            {/* Washers */}
            <Route path="washers" element={<WashersOverview />} />
            <Route path="reprocessing" element={<WashersOverview />} />
            <Route path="devices/:deviceId" element={<DeviceDetail />} />

            {/* Cycles */}
            <Route path="wash-cycles" element={<WashCycles />} />
            <Route path="wash-cycles/upload" element={<UploadCycle />} />

            {/* Connectors */}
            <Route path="connectors" element={<Connectors />} />
            <Route path="integrations" element={<Navigate to="/connectors" replace />} />

            {/* Pipelines */}
            <Route path="pipelines" element={<Pipelines />} />
            <Route path="workflows" element={<Navigate to="/pipelines" replace />} />

            {/* ⭐ Real Dashboards page */}
            <Route path="dashboards" element={<Dashboards />} />

            {/* Other placeholders */}
            <Route
              path="alerts"
              element={
                <UnderConstruction
                  title="Alerts"
                  description="Real-time alerts and notifications are on the way."
                />
              }
            />
            <Route
              path="finance"
              element={
                <UnderConstruction
                  title="Finance"
                  description="ERP integrations and billing orchestration are coming soon."
                />
              }
            />
          </Route>

          {/* Catch-all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
