/**
 * Settings view — full-workspace config management for the vibe-codr engine.
 *
 * When active, this replaces the normal workspace layout:
 *   Left rail  → settings section navigation + scope toggle
 *   Center     → scrollable form area with the active section + sticky save bar
 *
 * Config is read/written via main-process IPC (config:read / config:write) to
 * the same JSONC files the engine loads on bootstrap:
 *   global  ~/.config/vibe-codr/config.json
 *   project <cwd>/.vibe/config.json
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { CONFIG_SECTIONS, type ConfigScope, type VibeConfig } from "../../shared/config-schema";
import { IconClose, IconSidebar } from "../icons";
import { ModelsSection } from "./sections/ModelsSection";
import { ProvidersSection } from "./sections/ProvidersSection";
import { McpSection } from "./sections/McpSection";
import { PermissionsSection } from "./sections/PermissionsSection";
import { AppearanceSection } from "./sections/AppearanceSection";
import { BehaviorSection } from "./sections/BehaviorSection";
import { SubagentsSection } from "./sections/SubagentsSection";
import { BuildSection } from "./sections/BuildSection";
import { MemorySection } from "./sections/MemorySection";
import { SearchSection } from "./sections/SearchSection";
import { CompactionSection } from "./sections/CompactionSection";
import { BudgetSection } from "./sections/BudgetSection";
import { HooksSection } from "./sections/HooksSection";
import { InstructionsSection } from "./sections/InstructionsSection";
import { AdvancedSection } from "./sections/AdvancedSection";

export type SectionId = (typeof CONFIG_SECTIONS)[number]["id"];

interface SettingsState {
  config: VibeConfig;
  original: VibeConfig;
  dirty: boolean;
  loading: boolean;
  error: string | null;
  saving: boolean;
  saveError: string | null;
}

const EMPTY_CONFIG: VibeConfig = {};

function configEqual(a: VibeConfig, b: VibeConfig): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ── Sidebar ──────────────────────────────────────────────────────────────

function SettingsSidebar({
  activeSection,
  onSelectSection,
  scope,
  onScopeChange,
  cwd,
  onClose,
}: {
  activeSection: SectionId;
  onSelectSection: (id: SectionId) => void;
  scope: ConfigScope;
  onScopeChange: (scope: ConfigScope) => void;
  cwd: string | null;
  onClose: () => void;
}) {
  return (
    <aside
      id="project-rail"
      className="project-rail is-open settings-rail"
      aria-label="Settings sections"
    >
      <div className="rail-chrome">
        <button type="button" className="icon-button rail-chrome-toggle no-drag" onClick={onClose} aria-label="Close settings">
          <IconSidebar size={15} />
        </button>
      </div>

      <div className="rail-title-row">
        <h1 className="rail-product-name">Settings</h1>
      </div>

      <div className="rail-actions settings-scope-row">
        <div className="settings-scope-toggle settings-scope-toggle-full" role="tablist" aria-label="Config scope">
          <button type="button" role="tab" aria-selected={scope === "global"} className={`settings-scope-btn settings-scope-btn-grow${scope === "global" ? " active" : ""}`} onClick={() => onScopeChange("global")}>Global</button>
          <button type="button" role="tab" aria-selected={scope === "project"} className={`settings-scope-btn settings-scope-btn-grow${scope === "project" ? " active" : ""}`} onClick={() => onScopeChange("project")} disabled={!cwd}>Project</button>
        </div>
      </div>

      <h2 className="rail-section-label">Sections</h2>
      <nav className="settings-nav-list" aria-label="Settings sections">
        {CONFIG_SECTIONS.map((section) => (
          <button key={section.id} type="button" className={`settings-nav-item${activeSection === section.id ? " active" : ""}`} onClick={() => onSelectSection(section.id)}>
            <span className="settings-nav-label">{section.label}</span>
            <span className="settings-nav-desc">{section.description}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

// ── Form area ────────────────────────────────────────────────────────────

function SettingsFormArea({
  activeSection,
  scope,
  cwd,
  onClose,
  showToast,
}: {
  activeSection: SectionId;
  scope: ConfigScope;
  cwd: string | null;
  onClose: () => void;
  showToast: (message: string, severity?: "info" | "warn" | "error") => void;
}) {
  const [state, setState] = useState<SettingsState>({
    config: EMPTY_CONFIG, original: EMPTY_CONFIG, dirty: false, loading: true, error: null, saving: false, saveError: null,
  });

  const loadConfig = useCallback(async (selectedScope: ConfigScope) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const res = await window.vibe.readConfig({ scope: selectedScope, cwd: selectedScope === "project" ? cwd ?? undefined : undefined });
      if (!res.ok) { setState((prev) => ({ ...prev, loading: false, error: res.error })); return; }
      const cfg = res.config ?? {};
      setState({ config: cfg, original: cfg, dirty: false, loading: false, error: null, saving: false, saveError: null });
    } catch (err) {
      setState((prev) => ({ ...prev, loading: false, error: err instanceof Error ? err.message : "Failed to load config" }));
    }
  }, [cwd]);

  useEffect(() => { void loadConfig(scope); }, [scope, loadConfig]);

  const updateConfig = useCallback((patch: Partial<VibeConfig>) => {
    setState((prev) => {
      const next = { ...prev.config, ...patch };
      return { ...prev, config: next, dirty: !configEqual(next, prev.original) };
    });
  }, []);

  const updateNested = useCallback(<K extends keyof VibeConfig>(key: K, patch: Partial<VibeConfig[K]>) => {
    setState((prev) => {
      const current = (prev.config[key] ?? {}) as Record<string, unknown>;
      const merged = { ...current, ...(patch as Record<string, unknown>) };
      const next = { ...prev.config, [key]: merged };
      return { ...prev, config: next, dirty: !configEqual(next, prev.original) };
    });
  }, []);

  const saveConfig = useCallback(async () => {
    setState((prev) => ({ ...prev, saving: true, saveError: null }));
    try {
      const res = await window.vibe.writeConfig({ scope, cwd: scope === "project" ? cwd ?? undefined : undefined, patch: state.config as Record<string, unknown> });
      if (!res.ok) { setState((prev) => ({ ...prev, saving: false, saveError: res.error })); return; }
      setState((prev) => ({ ...prev, original: prev.config, dirty: false, saving: false, saveError: null }));
      showToast("Settings saved — new sessions will use these values", "info");
    } catch (err) {
      setState((prev) => ({ ...prev, saving: false, saveError: err instanceof Error ? err.message : "Failed to save" }));
    }
  }, [scope, cwd, state.config, showToast]);

  const resetConfig = useCallback(() => {
    setState((prev) => ({ ...prev, config: prev.original, dirty: false, saveError: null }));
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); }
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => document.removeEventListener("keydown", onKeyDown, true);
  }, [onClose]);

  const sectionProps = useMemo(() => ({ config: state.config, scope, updateConfig, updateNested, cwd }), [state.config, scope, updateConfig, updateNested, cwd]);

  const renderSection = () => {
    switch (activeSection) {
      case "models": return <ModelsSection {...sectionProps} />;
      case "providers": return <ProvidersSection {...sectionProps} />;
      case "mcp": return <McpSection {...sectionProps} />;
      case "permissions": return <PermissionsSection {...sectionProps} />;
      case "appearance": return <AppearanceSection {...sectionProps} />;
      case "behavior": return <BehaviorSection {...sectionProps} />;
      case "subagents": return <SubagentsSection {...sectionProps} />;
      case "build": return <BuildSection {...sectionProps} />;
      case "memory": return <MemorySection {...sectionProps} />;
      case "search": return <SearchSection {...sectionProps} />;
      case "compaction": return <CompactionSection {...sectionProps} />;
      case "budget": return <BudgetSection {...sectionProps} />;
      case "hooks": return <HooksSection {...sectionProps} />;
      case "instructions": return <InstructionsSection {...sectionProps} />;
      case "advanced": return <AdvancedSection {...sectionProps} />;
      default: return null;
    }
  };

  const activeMeta = CONFIG_SECTIONS.find((s) => s.id === activeSection);

  return (
    <div className="main-column settings-main" id="main-content">
      <div className="settings-form-header">
        <div className="settings-form-header-copy">
          <h2 className="settings-form-title">{activeMeta?.label}</h2>
          <p className="settings-form-sub">{activeMeta?.description}</p>
        </div>
      </div>

      <div className="settings-form-scroll">
        {state.loading ? (
          <div className="settings-loading"><span className="spinner" aria-hidden /> Loading config…</div>
        ) : state.error ? (
          <div className="settings-error" role="alert">
            <p>Couldn't load config: {state.error}</p>
            <button type="button" className="button" onClick={() => void loadConfig(scope)}>Retry</button>
          </div>
        ) : (
          <>
            {renderSection()}
            {state.saveError && <div className="settings-save-error" role="alert">Save failed: {state.saveError}</div>}
          </>
        )}
      </div>

      {!state.loading && !state.error && (
        <div className="settings-save-bar">
          <div className="settings-save-status">
            {state.dirty
              ? <span className="settings-dirty-indicator">Unsaved changes</span>
              : <span className="settings-clean-indicator">All changes saved</span>}
          </div>
          <div className="settings-save-actions">
            <button type="button" className="button" onClick={resetConfig} disabled={!state.dirty || state.saving}>Reset</button>
            <button type="button" className="button primary" onClick={() => void saveConfig()} disabled={!state.dirty || state.saving}>
              {state.saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Combined view (used by App.tsx) ──────────────────────────────────────

export function SettingsView({
  cwd,
  onClose,
  showToast,
}: {
  cwd: string | null;
  onClose: () => void;
  showToast: (message: string, severity?: "info" | "warn" | "error") => void;
}) {
  const [activeSection, setActiveSection] = useState<SectionId>("models");
  const [scope, setScope] = useState<ConfigScope>("global");

  return (
    <>
      <SettingsSidebar
        activeSection={activeSection}
        onSelectSection={setActiveSection}
        scope={scope}
        onScopeChange={setScope}
        cwd={cwd}
        onClose={onClose}
      />
      <div className="content-inset">
        <header className="topbar">
          <div className="topbar-leading">
            <h1 className="topbar-title">
              <span className="topbar-project">Settings</span>
              <span className="topbar-separator" aria-hidden>/</span>
              <span className="topbar-session">{scope === "global" ? "Global" : "Project"}</span>
            </h1>
          </div>
          <div className="topbar-actions no-drag">
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close settings" title="Close settings (Esc)">
              <IconClose size={16} />
            </button>
          </div>
        </header>
        <SettingsFormArea activeSection={activeSection} scope={scope} cwd={cwd} onClose={onClose} showToast={showToast} />
      </div>
    </>
  );
}
