import type { SectionProps } from "./types";
import { NumberInput, SelectInput, SettingField, SettingSection, TextArea, TextInput } from "../FormControls";

export function ModelsSection({ config, updateConfig, updateNested }: SectionProps) {
  const reasoning = config.reasoning ?? {};
  return (
    <>
      <SettingSection title="Model Selection" description="Choose which models the agent uses for different tasks.">
        <SettingField label="Default model" description="The primary model string (e.g. anthropic/claude-opus-4-8, openai/gpt-5.5, ollama/llama3.3).">
          <TextInput
            value={config.model ?? ""}
            onChange={(v) => updateConfig({ model: v || undefined })}
            placeholder="anthropic/claude-opus-4-8"
            monospace
          />
        </SettingField>
        <SettingField label="Planning model" description="Dedicated model for plan-mode turns. Unset = same as default.">
          <TextInput
            value={config.planModel ?? ""}
            onChange={(v) => updateConfig({ planModel: v || undefined })}
            placeholder="inherit default"
            monospace
          />
        </SettingField>
        <SettingField label="Model fallbacks" description="Failover chain (one per line). Used when the active model can't be resolved.">
          <TextArea
            value={(config.modelFallbacks ?? []).join("\n")}
            onChange={(v) => updateConfig({ modelFallbacks: v.split("\n").map((s) => s.trim()).filter(Boolean) })}
            placeholder={"openai/gpt-5.5\nollama/llama3.3"}
            rows={3}
            monospace
          />
        </SettingField>
      </SettingSection>

      <SettingSection title="Reasoning" description="Extended-thinking controls passed to providers that support them.">
        <SettingField label="Reasoning effort" description="Maps to OpenAI reasoningEffort / OpenRouter.">
          <SelectInput
            value={reasoning.effort ?? "default"}
            onChange={(v) => updateNested("reasoning", { effort: v === "default" ? undefined : v as "low" | "medium" | "high" })}
            options={[
              { value: "default", label: "Provider default" },
              { value: "low", label: "Low" },
              { value: "medium", label: "Medium" },
              { value: "high", label: "High" },
            ]}
          />
        </SettingField>
        <SettingField label="Budget tokens" description="Anthropic extended-thinking budget (tokens). Unset = provider default.">
          <NumberInput
            value={reasoning.budgetTokens}
            onChange={(v) => updateNested("reasoning", { budgetTokens: v })}
            min={1}
            placeholder="auto"
          />
        </SettingField>
      </SettingSection>

      <SettingSection title="Performance" description="Step and stream limits that bound agent behavior.">
        <SettingField label="Max steps per turn" description="Hard cap on agentic steps in a single turn.">
          <NumberInput
            value={config.maxSteps}
            onChange={(v) => updateConfig({ maxSteps: v })}
            min={1}
            placeholder="64"
          />
        </SettingField>
        <SettingField label="Stream idle timeout (ms)" description="Watchdog for stalled provider streams (headless only). 0 = disabled.">
          <NumberInput
            value={config.streamIdleTimeoutMs}
            onChange={(v) => updateConfig({ streamIdleTimeoutMs: v })}
            min={0}
            step={1000}
            placeholder="600000"
          />
        </SettingField>
      </SettingSection>
    </>
  );
}
