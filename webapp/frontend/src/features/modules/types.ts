// src/features/modules/types.ts

export type ModuleKey =
  | "machine-monitoring"
  | "finance"
  | "integration-hub"
  | "tray-archive"
  | "analytics";

export type ModuleToggle = {
  key: ModuleKey;
  enabled: boolean;
};

export type Environment = {
  id: number;
  name: string;
  domain?: string;
  address?: string;
  timezone?: string;
};