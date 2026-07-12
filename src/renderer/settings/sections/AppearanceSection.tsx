import type { SectionProps } from "./types";
import { SelectInput, SettingField, SettingSection, TextInput, ToggleSwitch } from "../FormControls";

const THEMES = [
  { value: "default", label: "Graphite (default)" },
  { value: "midnight", label: "Midnight" },
  { value: "nord", label: "Nord" },
  { value: "solarized-dark", label: "Solarized Dark" },
  { value: "solarized-light", label: "Solarized Light" },
  { value: "github", label: "GitHub" },
  { value: "dracula", label: "Dracula" },
  { value: "rose-pine", label: "Rose Pine" },
];

export function AppearanceSection({ config, updateConfig }: SectionProps) {
  return (
    <SettingSection title="Appearance" description="Visual theme, accent color, transcript density, and mouse behavior.">
      <SettingField label="Theme" description="Color palette for the UI.">
        <SelectInput
          value={config.theme ?? "default"}
          onChange={(v) => updateConfig({ theme: v })}
          options={THEMES}
        />
      </SettingField>
      <SettingField label="Accent color" description="Hex color for UI chrome that overrides the theme's primary. Empty = theme default.">
        <TextInput
          value={config.accentColor ?? ""}
          onChange={(v) => updateConfig({ accentColor: v || undefined })}
          placeholder="theme default"
          monospace
        />
      </SettingField>
      <SettingField label="Density" description="How much tool/thinking detail the transcript shows.">
        <SelectInput
          value={config.details ?? "normal"}
          onChange={(v) => updateConfig({ details: v as "quiet" | "normal" | "verbose" })}
          options={[
            { value: "quiet", label: "Quiet — collapsed tools, no thinking" },
            { value: "normal", label: "Normal — default detail" },
            { value: "verbose", label: "Verbose — diffs, errors, subagent replies" },
          ]}
        />
      </SettingField>
      <SettingField label="Mouse capture" description="Capture mouse for click-to-expand and select-to-copy (TUI). Disable for terminal-native selection.">
        <ToggleSwitch
          checked={config.mouse ?? true}
          onChange={(v) => updateConfig({ mouse: v })}
        />
      </SettingField>
    </SettingSection>
  );
}
