// src/features/modules/RequireModule.tsx

import React from "react";
import { Navigate } from "react-router-dom";
import { useModules } from "./ModulesContext";
import type { ModuleKey } from "./types";

export function RequireModule({
  module,
  children,
  fallbackTo = "/home",
}: {
  module: ModuleKey;
  children: React.ReactNode;
  fallbackTo?: string;
}) {
  const { isEnabled, loading } = useModules();

  // While modules are loading, you can return null or a small spinner
  if (loading) return null;

  if (!isEnabled(module)) return <Navigate to={fallbackTo} replace />;
  return <>{children}</>;
}
``