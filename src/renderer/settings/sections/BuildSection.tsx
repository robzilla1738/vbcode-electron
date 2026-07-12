import type { SectionProps } from "./types";
import { NumberInput, SelectInput, SettingField, SettingSection, TextInput, ToggleSwitch } from "../FormControls";

export function BuildSection({ config, updateNested }: SectionProps) {
  const build = config.build ?? {};
  const gate = build.gate ?? {};
  return (
    <>
      <SettingSection title="Build Intelligence" description="Deterministic repo recon, green gate, checkpoints, and adversarial diff review.">
        <SettingField label="Enable build intelligence" description="Master switch — off restores legacy verify.auto-only behavior.">
          <ToggleSwitch checked={build.enabled ?? true} onChange={(v) => updateNested("build", { enabled: v })} />
        </SettingField>
        <SettingField label="Visual verify" description="Boot dev server headless and check rendering (needs Playwright).">
          <ToggleSwitch checked={build.visualVerify ?? true} onChange={(v) => updateNested("build", { visualVerify: v })} />
        </SettingField>
      </SettingSection>

      <SettingSection title="Green Gate" description="After mutating turns, run checks (typecheck → test → build → lint) and fix failures.">
        <SettingField label="Enable gate">
          <ToggleSwitch checked={gate.enabled ?? true} onChange={(v) => updateNested("build", { gate: { enabled: v } })} />
        </SettingField>
        <SettingField label="Max fix rounds" description="Bounded red→fix→re-gate rounds per user prompt.">
          <NumberInput value={gate.maxRounds} onChange={(v) => updateNested("build", { gate: { maxRounds: v } })} min={0} max={10} placeholder="5" />
        </SettingField>
        <SettingField label="Per-check timeout (seconds)" description="Wall-clock cap per check.">
          <NumberInput value={gate.timeoutSec} onChange={(v) => updateNested("build", { gate: { timeoutSec: v } })} min={1} placeholder="600" />
        </SettingField>
      </SettingSection>

      <SettingSection title="Commit Strategy" description="What happens when the gate passes.">
        <SettingField label="Commit mode" description="checkpoint = hidden ref (default); branch = work branch; off = none.">
          <SelectInput
            value={build.commit?.mode ?? "checkpoint"}
            onChange={(v) => updateNested("build", { commit: { mode: v as "checkpoint" | "branch" | "off" } })}
            options={[
              { value: "checkpoint", label: "Checkpoint (hidden ref)" },
              { value: "branch", label: "Branch (work branch)" },
              { value: "off", label: "Off" },
            ]}
          />
        </SettingField>
        <SettingField label="Branch prefix" description="Prefix for work branches.">
          <TextInput
            value={build.commit?.branchPrefix ?? ""}
            onChange={(v) => updateNested("build", { commit: { branchPrefix: v } })}
            placeholder="vibe/"
            monospace
          />
        </SettingField>
      </SettingSection>

      <SettingSection title="Review" description="Adversarial diff review after the gate is green.">
        <SettingField label="Enable review">
          <ToggleSwitch checked={build.review?.enabled ?? true} onChange={(v) => updateNested("build", { review: { enabled: v } })} />
        </SettingField>
        <SettingField label="Max review rounds">
          <NumberInput value={build.review?.maxRounds} onChange={(v) => updateNested("build", { review: { maxRounds: v } })} min={0} max={5} placeholder="1" />
        </SettingField>
        <SettingField label="Stub scan" description="Feed deterministic stub-scan findings into the review.">
          <ToggleSwitch checked={build.review?.stubScan ?? true} onChange={(v) => updateNested("build", { review: { stubScan: v } })} />
        </SettingField>
      </SettingSection>

      <SettingSection title="Worktrees & Ensemble" description="Isolated git worktrees for parallel tasks and best-of-N ensemble.">
        <SettingField label="Enable worktrees">
          <ToggleSwitch checked={build.worktrees?.enabled ?? true} onChange={(v) => updateNested("build", { worktrees: { enabled: v } })} />
        </SettingField>
        <SettingField label="Ensemble N" description="Best-of-N parallel attempts for hard tasks. 0 = off (default).">
          <NumberInput value={build.ensemble?.n} onChange={(v) => updateNested("build", { ensemble: { n: v } })} min={0} max={5} placeholder="0" />
        </SettingField>
      </SettingSection>

      <SettingSection title="Model Tiers" description="Model routing for task tiers. Unset tiers fall back to subagent.model → main model.">
        <SettingField label="Cheap tier" description="For scouts, bulk extraction, mechanical work.">
          <TextInput
            value={build.models?.cheap ?? ""}
            onChange={(v) => updateNested("build", { models: { cheap: v || undefined } })}
            placeholder="inherit"
            monospace
          />
        </SettingField>
        <SettingField label="Strong tier" description="For architecture, integration, reviewers.">
          <TextInput
            value={build.models?.strong ?? ""}
            onChange={(v) => updateNested("build", { models: { strong: v || undefined } })}
            placeholder="inherit"
            monospace
          />
        </SettingField>
      </SettingSection>
    </>
  );
}
