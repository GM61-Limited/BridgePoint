import { type ReactNode, useEffect } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { AuthProvider, useAuth } from "./features/auth/AuthContext";

// ✅ NEW: inactivity + countdown manager
import SessionManager from "./features/auth/SessionManager";

import Home from "./pages/home";
import Layout from "./pages/layout";
import LoginPage from "./pages/LoginPage";
import Settings from "./pages/settings";
import UnderConstruction from "./pages/UnderConstruction";

// Machine Monitoring pages
import DeviceDetail from "./pages/DeviceDetail";
import UploadCycle from "./pages/UploadCycle";
import WashCycleDetails from "./pages/WashCycleDetails";
import WashCycles from "./pages/WashCycles";
import WashersOverview from "./pages/WashersOverview";

// ✅ Machine Monitoring Dashboard
import MachinesDashboard from "./pages/MachinesDashboard";

// ✅ Health (Predictive / Maintenance placeholder)
import Health from "./pages/Health";

// ✅ NEW: Maintenance placeholder page
import Maintenance from "./pages/Maintenance";

// ✅ NEW: Logs / Audit page (core app, not machine-specific)
import LogsPage from "./pages/LogsPage";

// ✅ NEW: Help page (core app)
import HelpPage from "./pages/HelpPage";

// Connectors
import Connectors from "./pages/connectors";

// Pipelines
import Pipelines from "./pages/pipelines";

// Dashboards
import Dashboards from "./pages/dashboards";

import { ModulesProvider } from "./features/modules/ModulesContext";
import { RequireModule } from "./features/modules/RequireModule";

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

  return isAuthenticated ? (
    <>{children}</>
  ) : (
    <Navigate to="/login" replace state={{ from: location }} />
  );
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

        {/* ✅ NEW: inactivity countdown + auto logout */}
        <SessionManager />

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
                <ModulesProvider>
                  <Layout />
                </ModulesProvider>
              </ProtectedRoute>
            }
          >
            <Route index element={<Home />} />
            <Route path="home" element={<Home />} />

            {/* Always available */}
            <Route path="settings" element={<Settings />} />

            {/* ✅ NEW: Core app Logs (not machine-specific) */}
            <Route path="logs" element={<LogsPage />} />

            {/* ✅ NEW: Help page (core app) */}
            <Route path="help" element={<HelpPage />} />

            {/* Machine Monitoring */}
            <Route
              path="machines"
              element={
                <RequireModule module="machine-monitoring">
                  <WashersOverview />
                </RequireModule>
              }
            />

            {/* ✅ Machines Dashboard */}
            <Route
              path="machines/dashboard"
              element={
                <RequireModule module="machine-monitoring">
                  <MachinesDashboard />
                </RequireModule>
              }
            />

            {/* ✅ Health (Preview) */}
            <Route
              path="machines/health"
              element={
                <RequireModule module="machine-monitoring">
                  <Health />
                </RequireModule>
              }
            />

            {/* ✅ NEW: Maintenance (Preview/Audit log) */}
            <Route
              path="machines/maintenance"
              element={
                <RequireModule module="machine-monitoring">
                  <Maintenance />
                </RequireModule>
              }
            />

            {/* Backwards compatibility */}
            <Route path="washers" element={<Navigate to="/machines" replace />} />

            <Route
              path="devices/:deviceId"
              element={
                <RequireModule module="machine-monitoring">
                  <DeviceDetail />
                </RequireModule>
              }
            />

            {/* Cycles */}
            <Route
              path="wash-cycles"
              element={
                <RequireModule module="machine-monitoring">
                  <WashCycles />
                </RequireModule>
              }
            />

            <Route
              path="wash-cycles/upload"
              element={
                <RequireModule module="machine-monitoring">
                  <UploadCycle />
                </RequireModule>
              }
            />

            {/* Cycle Details */}
            <Route
              path="wash-cycles/:id"
              element={
                <RequireModule module="machine-monitoring">
                  <WashCycleDetails />
                </RequireModule>
              }
            />

            {/* Integration Hub */}
            <Route
              path="connectors"
              element={
                <RequireModule module="integration-hub">
                  <Connectors />
                </RequireModule>
              }
            />
            <Route
              path="integrations"
              element={
                <RequireModule module="integration-hub">
                  <Navigate to="/connectors" replace />
                </RequireModule>
              }
            />

            <Route
              path="pipelines"
              element={
                <RequireModule module="integration-hub">
                  <Pipelines />
                </RequireModule>
              }
            />
            <Route
              path="workflows"
              element={
                <RequireModule module="integration-hub">
                  <Navigate to="/pipelines" replace />
                </RequireModule>
              }
            />

            {/* Analytics */}
            <Route
              path="dashboards"
              element={
                <RequireModule module="analytics">
                  <Dashboards />
                </RequireModule>
              }
            />

            {/* Finance */}
            <Route
              path="finance"
              element={
                <RequireModule module="finance">
                  <UnderConstruction
                    title="Finance"
                    description="ERP integrations and billing orchestration are coming soon."
                  />
                </RequireModule>
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