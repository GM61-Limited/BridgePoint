// src/features/modules/ModulesContext.tsx

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getEnvironment, getEnvironmentModules } from "../../lib/api";
import { useAuth } from "../auth/AuthContext";
import type { Environment, ModuleKey, ModuleToggle } from "./types";

type ModulesContextValue = {
  environment: Environment | null;
  modules: ModuleToggle[];
  loading: boolean;
  error: string | null;
  isEnabled: (key: ModuleKey) => boolean;
  reload: () => Promise<void>;
};

const ModulesContext = createContext<ModulesContextValue | null>(null);

// Safe defaults (match your intended MVP defaults)
const DEFAULTS: Record<ModuleKey, boolean> = {
  "machine-monitoring": true,
  "finance": false,
  "integration-hub": false,
  "tray-archive": false,
  "analytics": false,
};

export function ModulesProvider({ children }: { children: React.ReactNode }) {
  const { token, bootstrapping, isAuthenticated } = useAuth();

  const [environment, setEnvironment] = useState<Environment | null>(null);
  const [modules, setModules] = useState<ModuleToggle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    if (!isAuthenticated || !token) return;

    setLoading(true);
    setError(null);

    try {
      const env = await getEnvironment();
      setEnvironment(env);

      const mods = await getEnvironmentModules(Number(env.id));
      setModules(mods);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load modules");
      // keep defaults behaviour via isEnabled fallback
      setModules([]);
      setEnvironment(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (bootstrapping) return;
    if (!isAuthenticated) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootstrapping, isAuthenticated, token]);

  const isEnabled = useMemo(() => {
    const map = new Map(modules.map((m) => [m.key, Boolean(m.enabled)] as const));
    return (key: ModuleKey) => map.get(key) ?? DEFAULTS[key] ?? false;
  }, [modules]);

  const value: ModulesContextValue = {
    environment,
    modules,
    loading,
    error,
    isEnabled,
    reload,
  };

  return <ModulesContext.Provider value={value}>{children}</ModulesContext.Provider>;
}

export function useModules() {
  const ctx = useContext(ModulesContext);
  if (!ctx) throw new Error("useModules must be used within ModulesProvider");
  return ctx;
}