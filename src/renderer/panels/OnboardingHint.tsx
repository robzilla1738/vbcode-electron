import { useEffect, useState } from "react";

/**
 * Onboarding hint when no provider is configured. Points at the shared CLI
 * config path so Electron and vibecodr stay in sync.
 */
export function OnboardingHint({
  onDismiss,
  onOpenProviders,
}: {
  onDismiss: () => void;
  onOpenProviders: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [configPath, setConfigPath] = useState("~/.config/vibe-codr/config.json");

  useEffect(() => {
    void window.vibe.globalConfigPath().then(setConfigPath).catch(() => undefined);
  }, []);

  if (!open) return null;
  return (
    <div className="onboarding-strip">
      <div className="onboarding-copy">
        <div className="onboarding-title">Setup</div>
        <p className="card-copy">
          No provider configured yet. Use <code>/providers</code> to add a key, or run{" "}
          <code>vibecodr setup</code>. Config is shared at <code>{configPath}</code>.
        </p>
      </div>
      <div className="card-actions">
        <button
          type="button"
          className="chip primary"
          onClick={() => {
            onOpenProviders();
            setOpen(false);
            onDismiss();
          }}
        >
          Open providers
        </button>
        <button
          type="button"
          className="chip"
          onClick={() => {
            setOpen(false);
            onDismiss();
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
