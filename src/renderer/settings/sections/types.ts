import type { ConfigScope, VibeConfig } from "../../../shared/config-schema";

export interface SectionProps {
  config: VibeConfig;
  scope: ConfigScope;
  updateConfig: (patch: Partial<VibeConfig>) => void;
  updateNested: <K extends keyof VibeConfig>(key: K, patch: Partial<VibeConfig[K]>) => void;
  cwd: string | null;
}
