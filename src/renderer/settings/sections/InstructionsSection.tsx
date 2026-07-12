import { useCallback, useEffect, useState } from "react";
import type { ConfigScope } from "../../../shared/config-schema";
import type { SectionProps } from "./types";
import { SettingField, SettingSection, TextArea } from "../FormControls";

export function InstructionsSection({ scope, cwd }: SectionProps) {
  const [activeScope, setActiveScope] = useState<ConfigScope>(scope);
  const [content, setContent] = useState("");
  const [original, setOriginal] = useState("");
  const [path, setPath] = useState("");
  const [exists, setExists] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async (loadScope: ConfigScope) => {
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      const res = await window.vibe.readMemory({ scope: loadScope, cwd: loadScope === "project" ? cwd ?? undefined : undefined });
      if (!res.ok) { setError(res.error); setLoading(false); return; }
      setContent(res.content);
      setOriginal(res.content);
      setPath(res.path);
      setExists(res.exists);
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      setLoading(false);
    }
  }, [cwd]);

  useEffect(() => { void load(activeScope); }, [activeScope, load]);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await window.vibe.writeMemory({ scope: activeScope, cwd: activeScope === "project" ? cwd ?? undefined : undefined, content });
      if (!res.ok) { setError(res.error); setSaving(false); return; }
      setOriginal(content);
      setExists(true);
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      setSaving(false);
    }
  }, [activeScope, cwd, content]);

  const dirty = content !== original;

  return (
    <SettingSection
      title="Custom Instructions"
      description="Project memory injected into the agent's system prompt. The engine reads VIBE.md, AGENTS.md, and CLAUDE.md from the repo root and ~/.config/vibe-codr/VIBE.md globally."
    >
      <div className="setting-scope-toggle" role="tablist" aria-label="Instructions scope">
        <button type="button" role="tab" aria-selected={activeScope === "global"} className={`settings-scope-btn${activeScope === "global" ? " active" : ""}`} onClick={() => setActiveScope("global")}>
          Global (~/.config/vibe-codr/VIBE.md)
        </button>
        <button type="button" role="tab" aria-selected={activeScope === "project"} className={`settings-scope-btn${activeScope === "project" ? " active" : ""}`} onClick={() => setActiveScope("project")} disabled={!cwd}>
          Project (VIBE.md)
        </button>
      </div>
      {loading ? (
        <p className="setting-empty"><span className="spinner" aria-hidden /> Loading…</p>
      ) : error ? (
        <div className="settings-save-error" role="alert">{error}</div>
      ) : (
        <>
          <SettingField
            label={exists ? "File content" : "Create file"}
            description={path}
          >
            <TextArea
              value={content}
              onChange={setContent}
              placeholder={"# Project instructions\n\nDescribe your project conventions, coding style, and any rules the agent should follow.\n\n- Use TypeScript strict mode\n- Prefer functional components\n- Run tests before declaring done"}
              rows={16}
              monospace
            />
          </SettingField>
          <div className="setting-actions">
            {dirty && <span className="settings-dirty-indicator">Unsaved</span>}
            {saved && <span className="settings-clean-indicator">Saved</span>}
            <button type="button" className="button" onClick={() => setContent(original)} disabled={!dirty || saving}>
              Reset
            </button>
            <button type="button" className="button primary" onClick={() => void save()} disabled={!dirty || saving}>
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </>
      )}
    </SettingSection>
  );
}
