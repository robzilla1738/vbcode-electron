/**
 * Reusable form primitives for the Settings panel.
 *
 * All styling is token-driven (no literal hex) and follows the existing design
 * system: --font-sans for labels, --font-mono for code values, hairline borders
 * + --edge-highlight for resting surfaces, focus rings via :focus-visible.
 */

import { type ReactNode, useEffect, useId, useState } from "react";
import { formatKeyValueLines, parseKeyValueLines } from "../../shared/key-value-lines";

// ── Field wrapper ────────────────────────────────────────────────────────

export function SettingField({
  label,
  description,
  children,
  htmlFor,
}: {
  label: string;
  description?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <div className="setting-field">
      <div className="setting-field-label">
        <label htmlFor={htmlFor}>{label}</label>
        {description && <p className="setting-field-desc">{description}</p>}
      </div>
      <div className="setting-field-control">{children}</div>
    </div>
  );
}

// ── Text input ───────────────────────────────────────────────────────────

export function TextInput({
  value,
  onChange,
  placeholder,
  monospace,
  disabled,
  type = "text",
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  monospace?: boolean;
  disabled?: boolean;
  type?: "text" | "password" | "number" | "url";
  id?: string;
}) {
  return (
    <input
      id={id}
      type={type}
      className={`setting-input${monospace ? " is-mono" : ""}`}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ── Number input ─────────────────────────────────────────────────────────

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step,
  placeholder,
  disabled,
  id,
}: {
  value: number | undefined;
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <input
      id={id}
      type="number"
      className="setting-input"
      value={value ?? ""}
      min={min}
      max={max}
      step={step}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => {
        const v = e.target.value;
        if (v === "") { onChange(undefined); return; }
        const n = Number(v);
        onChange(Number.isFinite(n) ? n : undefined);
      }}
    />
  );
}

// ── Select ───────────────────────────────────────────────────────────────

export function SelectInput<T extends string>({
  value,
  onChange,
  options,
  disabled,
  id,
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
  id?: string;
}) {
  return (
    <select
      id={id}
      className="setting-select"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {options.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

// ── Toggle switch ────────────────────────────────────────────────────────

export function ToggleSwitch({
  checked,
  onChange,
  disabled,
  id,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}) {
  const generatedId = useId();
  const switchId = id ?? generatedId;
  return (
    <button
      type="button"
      id={switchId}
      role="switch"
      aria-checked={checked}
      className={`setting-toggle${checked ? " is-on" : ""}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="setting-toggle-thumb" />
    </button>
  );
}

// ── Textarea ─────────────────────────────────────────────────────────────

export function TextArea({
  value,
  onChange,
  placeholder,
  rows = 6,
  monospace,
  disabled,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  monospace?: boolean;
  disabled?: boolean;
  id?: string;
}) {
  return (
    <textarea
      id={id}
      className={`setting-textarea${monospace ? " is-mono" : ""}`}
      value={value}
      placeholder={placeholder}
      rows={rows}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/**
 * Draft-preserving editor for environment variables and HTTP headers. Invalid
 * partial lines stay visible with an inline error and are never silently
 * discarded from the controlled config object.
 */
export function KeyValueTextArea({
  value,
  onChange,
  separator,
  resetKey,
  placeholder,
  rows = 3,
  trimValues = separator === ":",
}: {
  value: Record<string, string> | undefined;
  onChange: (value: Record<string, string> | undefined) => void;
  separator: "=" | ":";
  resetKey: string;
  placeholder?: string;
  rows?: number;
  trimValues?: boolean;
}) {
  const formatted = formatKeyValueLines(value ?? {}, separator);
  const [draft, setDraft] = useState(formatted);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDraft(formatted);
    setError(null);
  }, [formatted, resetKey]);

  return (
    <>
      <textarea
        className="setting-textarea is-mono"
        value={draft}
        placeholder={placeholder}
        rows={rows}
        aria-invalid={error ? true : undefined}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const parsed = parseKeyValueLines(next, separator, { trimValues });
          if (!parsed.ok) {
            setError(parsed.error);
            return;
          }
          setError(null);
          onChange(Object.keys(parsed.value).length ? parsed.value : undefined);
        }}
      />
      {error ? <div className="settings-save-error" role="alert">{error}</div> : null}
    </>
  );
}

// ── Section card ─────────────────────────────────────────────────────────

export function SettingSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="setting-section">
      <div className="setting-section-header">
        <h3 className="setting-section-title">{title}</h3>
        {description && <p className="setting-section-desc">{description}</p>}
      </div>
      <div className="setting-section-body">{children}</div>
    </section>
  );
}

// ── Row of actions ───────────────────────────────────────────────────────

export function SettingActions({ children }: { children: ReactNode }) {
  return <div className="setting-actions">{children}</div>;
}

// ── Badge ────────────────────────────────────────────────────────────────

export function SettingBadge({ children, tone }: { children: ReactNode; tone?: "neutral" | "warn" | "danger" }) {
  return (
    <span className={`setting-badge${tone ? ` is-${tone}` : ""}`}>{children}</span>
  );
}
