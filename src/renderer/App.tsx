import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  AgentInfo,
  ModelSummary,
  ProviderInfo,
  SkillInfo,
  McpServerInfo,
} from "../shared/types";
import type { ProjectSummary } from "../shared/protocol";
import { isProjectSummaryArray } from "../shared/runtime-guards";
import { RequestGate } from "./hooks/request-gate";
import { lineToCommands, routePendingPermLine } from "../shared/slash";
import { nextDensity } from "../shared/density";
import { formatKeysHelp } from "../shared/keys-help";
import {
  agentsPickerQuery,
  currentModelForTarget,
  mcpPickerQuery,
  modelPicker,
  normalizeMcpServer,
  providersPickerQuery,
  skillsPickerFilter,
  type ModelPickerTarget,
} from "../shared/catalog-draft";
import { useSession } from "./hooks/useSession";
import { Splash, StarterPills } from "./layout/Splash";
import { SessionBoot, SessionBootError, WelcomeGate } from "./layout/WelcomeGate";
import { LiveSidebar } from "./layout/Sidebar";
import { TranscriptView } from "./transcript/TranscriptView";
import { Composer } from "./composer/Composer";
import { PermissionCard, PlanCard, QueuePanel } from "./panels/LivePanels";
import { JobsView } from "./panels/JobsView";
import { OnboardingHint } from "./panels/OnboardingHint";
import { CatalogModal, type CatalogChoice, type CatalogPicker } from "./pickers/CatalogModal";
import { Inspector } from "./panels/Inspector";
import { WorkingSpinner } from "./panels/WorkingSpinner";
import { ProjectRail } from "./layout/ProjectRail";
import { IconJobs, IconPanel, IconSidebar } from "./icons";
import { hasUnfinishedTasks, windowTasks } from "../shared/task-window";

type Picker = CatalogPicker | null;

function pickerMatchesDraft(picker: Picker, draft: string, modelTarget: "main" | "sub"): boolean {
  if (!picker) return false;
  if (picker.kind === "models") return modelPicker(draft, modelTarget) !== null;
  if (picker.kind === "providers") return providersPickerQuery(draft) !== null;
  if (picker.kind === "agents") return agentsPickerQuery(draft) !== null;
  if (picker.kind === "skills") return skillsPickerFilter(draft) !== null;
  return mcpPickerQuery(draft) !== null;
}

function asMcpList(value: unknown): McpServerInfo[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => normalizeMcpServer((row ?? {}) as Record<string, unknown>));
}

function gitSummary(git: { branch: string; dirty: number; ahead: number; behind: number; worktree: boolean } | null): string | null {
  if (!git) return null;
  const bits = [git.branch];
  if (git.dirty) bits.push(`${git.dirty} dirty`);
  if (git.ahead) bits.push(`↑${git.ahead}`);
  if (git.behind) bits.push(`↓${git.behind}`);
  if (git.worktree) bits.push("worktree");
  return bits.join(" ");
}

function goalSuffix(goal: string | null, run: { active: boolean; phase: string | null; round: number; max: number; pausedReason: string | null; met: boolean } | null): string | null {
  if (!goal) return null;
  if (!run) return `★ ${goal}`;
  if (run.met) return `★ ${goal} · met`;
  if (run.active) {
    // TUI parity: plan phase reads planning (not plan) and does NOT show
    // round/max until the execute phase begins.
    if (run.phase === "plan") return `★ ${goal} · planning`;
    const phase = run.phase ? ` · ${run.phase}` : "";
    return `★ ${goal}${phase} · ${run.round}/${run.max}`;
  }
  if (run.pausedReason) return `★ ${goal} · paused`;
  return `★ ${goal}`;
}

function changedSummary(files: { path: string; added: number; removed: number }[]): string | null {
  if (!files.length) return null;
  const added = files.reduce((a, f) => a + f.added, 0);
  const removed = files.reduce((a, f) => a + f.removed, 0);
  return `${files.length} changed +${added} -${removed}`;
}

/** Compact token count: `1.5k` at ≥1000, the raw number below (TUI parity: fmtCount). */
function fmtCount(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : `${n}`;
}

/** Full usage label: `12.3k tok · $0.0421 · 1.1k cached` (TUI parity: headless formatUsage). */
function formatUsage(u: { totalTokens: number; costUSD: number; costEstimated?: boolean; cachedInputTokens?: number }): string | null {
  if (!u.totalTokens) return null;
  const tok = fmtCount(u.totalTokens);
  const prefix = u.costEstimated ? "~$" : "$";
  const digits = u.costUSD === 0 ? 2 : u.costUSD < 1 ? 4 : 2;
  const cost = ` · ${prefix}${u.costUSD.toFixed(digits)}`;
  const cached =
    u.cachedInputTokens && u.cachedInputTokens > 0
      ? ` · ${fmtCount(u.cachedInputTokens)} cached`
      : "";
  return `${tok} tok${cost}${cached}`;
}

export function App() {
  const [cwd, setCwd] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [picker, setPicker] = useState<Picker>(null);
  const [modelTarget, setModelTarget] = useState<"main" | "sub">("main");
  const agentsCache = useRef<AgentInfo[] | null>(null);
  const modelsCache = useRef<ModelSummary[] | null>(null);
  const providersCache = useRef<ProviderInfo[] | null>(null);
  const skillsCache = useRef<SkillInfo[] | null>(null);
  const mcpCache = useRef<McpServerInfo[] | null>(null);
  const catalogGeneration = useRef(0);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [projectRailOpen, setProjectRailOpen] = useState(true);
  const [followSignal, setFollowSignal] = useState(0);
  const didRestoreProject = useRef(false);
  const projectRefreshGate = useRef(new RequestGate());
  const session = useSession(cwd);
  const showToastRef = useRef(session.showToast);
  showToastRef.current = session.showToast;
  const chromeRef = useRef(session.chrome);
  chromeRef.current = session.chrome;

  const invalidateCatalogs = useCallback(() => {
    catalogGeneration.current += 1;
    agentsCache.current = null;
    modelsCache.current = null;
    providersCache.current = null;
    skillsCache.current = null;
    mcpCache.current = null;
    setPicker(null);
    setModelTarget("main");
  }, []);

  const refreshProjects = useCallback(async () => {
    const request = projectRefreshGate.current.begin();
    setProjectsLoading(true);
    try {
      const res = await window.vibe.listProjects();
      if (!projectRefreshGate.current.isCurrent(request)) return;
      if (res.ok && isProjectSummaryArray(res.value)) {
        setProjects(res.value);
        setProjectsError(null);
      } else {
        setProjectsError("Project history is unavailable.");
      }
    } catch {
      if (projectRefreshGate.current.isCurrent(request)) {
        setProjectsError("Project history is unavailable.");
      }
    } finally {
      if (projectRefreshGate.current.isCurrent(request)) setProjectsLoading(false);
    }
  }, []);

  const openProjectAt = useCallback(
    async (path: string) => {
      invalidateCatalogs();
      setCwd(path);
      const ok = await session.bootstrap({ cwd: path });
      if (ok) {
        await refreshProjects();
        const prov = await window.vibe.rpc("listProviders");
        if (prov.ok) {
          const items = (prov.value as ProviderInfo[]) ?? [];
          const anyReady = items.some((p) => p.configured || p.keyless);
          setShowOnboarding(!anyReady);
        }
      }
    },
    [session, refreshProjects, invalidateCatalogs],
  );

  const openProject = useCallback(async () => {
    if (session.chrome.busy) {
      session.showToast("Stop the current turn before switching projects.");
      return;
    }
    const path = await window.vibe.openProject();
    if (!path) return;
    await openProjectAt(path);
  }, [openProjectAt, session]);

  // Restore last project on launch
  useEffect(() => {
    if (didRestoreProject.current) return;
    didRestoreProject.current = true;
    try {
      const last = localStorage.getItem("vibe.lastCwd");
      if (last) void openProjectAt(last);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const resumeSession = useCallback(
    async (projectCwd: string, id: string) => {
      if (session.chrome.busy) {
        session.showToast("Stop the current turn before switching sessions.");
        return;
      }
      invalidateCatalogs();
      setCwd(projectCwd);
      const ok = await session.bootstrap({ cwd: projectCwd, resume: id });
      if (ok) await refreshProjects();
    },
    [session, refreshProjects, invalidateCatalogs],
  );

  const continueLatest = useCallback(async () => {
    if (!cwd) return;
    if (session.chrome.busy) {
      session.showToast("Stop the current turn before switching sessions.");
      return;
    }
    invalidateCatalogs();
    const ok = await session.bootstrap({ cwd, continueLatest: true });
    if (ok) await refreshProjects();
  }, [cwd, session, refreshProjects, invalidateCatalogs]);

  const newSession = useCallback(async () => {
    if (!cwd) return false;
    if (session.chrome.busy) await session.send({ type: "abort" });
    invalidateCatalogs();
    const ok = await session.bootstrap({ cwd });
    if (ok) {
      setDraft("");
      setFollowSignal((value) => value + 1);
      await refreshProjects();
    }
    return ok;
  }, [cwd, session, refreshProjects, invalidateCatalogs]);

  const renameSession = useCallback(
    async (projectCwd: string, id: string, title: string) => {
      const res = await window.vibe.renameSession({ cwd: projectCwd, id, title });
      if (!res.ok) {
        session.showToast(res.error || "Rename failed");
        return false;
      }
      await refreshProjects();
      return true;
    },
    [refreshProjects, session],
  );

  const removeSession = useCallback(
    async (projectCwd: string, id: string, mode: "delete" | "archive") => {
      const active = id === session.chrome.sessionId && projectCwd === cwd;
      // Retire/finalize the active engine before removing its persisted record;
      // otherwise shutdown can save the just-deleted session back to disk.
      if (active && !(await newSession())) return false;
      const res =
        mode === "delete"
          ? await window.vibe.deleteSession({ cwd: projectCwd, id })
          : await window.vibe.archiveSession({ cwd: projectCwd, id });
      if (!res.ok) {
        session.showToast(res.error || `${mode === "delete" ? "Delete" : "Archive"} failed`);
        return false;
      }
      await refreshProjects();
      session.showToast(mode === "delete" ? "Session deleted" : "Session archived");
      return true;
    },
    [cwd, newSession, refreshProjects, session],
  );

  const answerPerm = useCallback(
    async (decision: "once" | "always" | "always-project" | "deny", feedback?: string) => {
      const perm = session.chrome.perms[0];
      if (!perm) return false;
      const sent = await session.send({
        type: "resolve-permission",
        id: perm.id,
        decision,
        ...(feedback ? { feedback } : {}),
      });
      if (!sent) return false;
      session.dispatchChrome({ type: "drop-perm", id: perm.id });
      // Do not synthesize an "allowed" transcript notice here. The IPC result
      // only acknowledges transport; a concurrent permission-settled event may
      // have already caused the engine to reject this stale id.
      return true;
    },
    [session],
  );

  const answerPlan = useCallback(
    async (
      decision: "accept" | "edit" | "keep-planning",
      edit?: string,
      approvals?: "auto",
    ) => {
      const sent = await session.send({
        type: "resolve-plan",
        decision,
        ...(edit ? { edit } : {}),
        ...(approvals ? { approvals } : {}),
      });
      if (!sent) return false;
      session.dispatchChrome({ type: "clear-plan" });
      return true;
    },
    [session],
  );

  const openModelsPicker = useCallback(
    async (target: ModelPickerTarget, query = ""): Promise<boolean> => {
      const generation = catalogGeneration.current;
      let items = modelsCache.current;
      if (!items) {
        const res = await window.vibe.rpc("listModels");
        if (generation !== catalogGeneration.current) return false;
        if (!res.ok) {
          showToastRef.current(`Couldn’t load models · ${res.error}`);
          return false;
        }
        items = res.value as ModelSummary[];
        modelsCache.current = items;
      }
      if (generation !== catalogGeneration.current) return false;
      const chrome = chromeRef.current;
      setPicker({
        kind: "models",
        items,
        target,
        query,
        current: currentModelForTarget(
          target,
          chrome.model,
          chrome.subagentModel,
          agentsCache.current ?? [],
        ),
      });
      return true;
    },
    [],
  );

  const submitLine = useCallback(
    async (line: string): Promise<boolean> => {
      const trimmed = line.trim();
      if (!trimmed) return false;
      const catalogRequestGeneration = catalogGeneration.current;

      if (trimmed === "/jobs") {
        session.setJobsView((v) => !v);
        return true;
      }

      if (trimmed === "/keys") {
        session.dispatchTranscript({
          type: "notice",
          text: formatKeysHelp(),
          level: "info",
        });
        return true;
      }

      setFollowSignal((value) => value + 1);

      if (session.chrome.perms[0] && !trimmed.startsWith("/")) {
        const route = routePendingPermLine(trimmed);
        if (route.kind === "perm") {
          return await answerPerm(route.decision, route.feedback);
        }
      }

      if (session.chrome.plan && !trimmed.startsWith("/")) {
        return await answerPlan("edit", trimmed);
      }

      if (trimmed === "/clear" || trimmed === "/new") {
        if (session.chrome.busy) await session.send({ type: "abort" });
        session.clearSessionLocal();
        return await session.sendMany(lineToCommands(trimmed));
      }

      // Bare catalog commands — keep Enter path for keyboard users; live draft also opens these.
      if (trimmed === "/model" || trimmed === "/models") {
        setModelTarget("main");
        const opened = await openModelsPicker("main");
        if (!opened) return false;
        if (trimmed === "/models") return await session.sendMany(lineToCommands(trimmed));
        return true;
      }
      if (trimmed === "/providers") {
        const res = await window.vibe.rpc("listProviders");
        if (catalogRequestGeneration !== catalogGeneration.current) return false;
        if (res.ok) {
          providersCache.current = res.value as ProviderInfo[];
          setPicker({ kind: "providers", items: providersCache.current });
        } else {
          showToastRef.current(`Couldn’t load providers · ${res.error}`);
          return false;
        }
        return true;
      }
      if (trimmed === "/agents") {
        const res = await window.vibe.rpc("listAgents");
        if (catalogRequestGeneration !== catalogGeneration.current) return false;
        if (res.ok) {
          const items = res.value as AgentInfo[];
          agentsCache.current = items;
          setPicker({ kind: "agents", items });
        } else {
          showToastRef.current(`Couldn’t load agents · ${res.error}`);
          return false;
        }
        return true;
      }
      if (trimmed === "/skills" || trimmed.startsWith("/skills ")) {
        const res = await window.vibe.rpc("listSkills");
        if (catalogRequestGeneration !== catalogGeneration.current) return false;
        if (res.ok) {
          skillsCache.current = res.value as SkillInfo[];
          setPicker({
            kind: "skills",
            items: skillsCache.current,
            query: trimmed.slice("/skills".length).trim(),
          });
        } else {
          showToastRef.current(`Couldn’t load skills · ${res.error}`);
          return false;
        }
        return true;
      }
      if (trimmed === "/mcp") {
        const res = await window.vibe.rpc("listMcp");
        if (catalogRequestGeneration !== catalogGeneration.current) return false;
        if (res.ok) {
          mcpCache.current = asMcpList(res.value);
          setPicker({ kind: "mcp", items: mcpCache.current });
        } else {
          showToastRef.current(`Couldn’t load MCP servers · ${res.error}`);
          return false;
        }
        return true;
      }

      if (trimmed === "/exit" || trimmed === "/quit") {
        window.vibe.quit();
        return true;
      }

      // Invalidate model/provider caches after key/refresh
      if (/^\/model\s+key\b/i.test(trimmed) || /^\/models?\s+refresh\b/i.test(trimmed)) {
        modelsCache.current = null;
        providersCache.current = null;
        setPicker(null);
      }

      session.setBusy(true);
      const sent = await session.sendMany(lineToCommands(trimmed));
      if (!sent) session.setBusy(false);
      return sent;
    },
    [session, answerPerm, answerPlan, openModelsPicker],
  );

  // Live draft catalogs — open/update pickers while typing (TUI parity).
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const chrome = chromeRef.current;
      const pick = modelPicker(draft, modelTarget);
      if (pick) {
        let items = modelsCache.current;
        if (!items) {
          const res = await window.vibe.rpc("listModels");
          if (cancelled) return;
          if (!res.ok) {
            showToastRef.current(`Couldn’t load models · ${res.error}`);
            return;
          }
          items = res.value as ModelSummary[];
          modelsCache.current = items;
        }
        if (cancelled) return;
        setPicker({
          kind: "models",
          items,
          target: pick.target,
          query: pick.query,
          current: currentModelForTarget(
            pick.target,
            chrome.model,
            chrome.subagentModel,
            agentsCache.current ?? [],
          ),
        });
        return;
      }

      const provQ = providersPickerQuery(draft);
      if (provQ !== null) {
        let items = providersCache.current;
        if (!items) {
          const res = await window.vibe.rpc("listProviders");
          if (cancelled) return;
          if (!res.ok) {
            showToastRef.current(`Couldn’t load providers · ${res.error}`);
            return;
          }
          items = res.value as ProviderInfo[];
          providersCache.current = items;
        }
        if (cancelled) return;
        setPicker({ kind: "providers", items, query: provQ });
        return;
      }

      const agentsQ = agentsPickerQuery(draft);
      if (agentsQ !== null) {
        let items = agentsCache.current;
        if (!items) {
          const res = await window.vibe.rpc("listAgents");
          if (cancelled) return;
          if (!res.ok) {
            showToastRef.current(`Couldn’t load agents · ${res.error}`);
            return;
          }
          items = res.value as AgentInfo[];
          agentsCache.current = items;
        }
        if (cancelled) return;
        setPicker({ kind: "agents", items, query: agentsQ });
        return;
      }

      const skillsQ = skillsPickerFilter(draft);
      if (skillsQ !== null) {
        let items = skillsCache.current;
        if (!items) {
          const res = await window.vibe.rpc("listSkills");
          if (cancelled) return;
          if (!res.ok) {
            showToastRef.current(`Couldn’t load skills · ${res.error}`);
            return;
          }
          items = res.value as SkillInfo[];
          skillsCache.current = items;
        }
        if (cancelled) return;
        setPicker({ kind: "skills", items, query: skillsQ });
        return;
      }

      const mcpQ = mcpPickerQuery(draft);
      if (mcpQ !== null) {
        let items = mcpCache.current;
        if (!items) {
          const res = await window.vibe.rpc("listMcp");
          if (cancelled) return;
          if (!res.ok) {
            showToastRef.current(`Couldn’t load MCP servers · ${res.error}`);
            return;
          }
          items = asMcpList(res.value);
          mcpCache.current = items;
        }
        if (cancelled) return;
        setPicker({ kind: "mcp", items, query: mcpQ });
        return;
      }

      // Typed away from a catalog draft — close. Empty draft leaves submit-opened pickers alone.
      if (draft.trim()) setPicker(null);
    };

    void sync();
    return () => {
      cancelled = true;
    };
  }, [draft, modelTarget, session.chrome.model, session.chrome.subagentModel]);

  const onCatalogChoose = useCallback(
    (choice: CatalogChoice) => {
      if (choice.kind === "command") {
        const cmd = choice.command;
        void (async () => {
          const sent = await session.send(cmd);
          if (!sent) return;
          setPicker(null);
          setDraft("");
          setModelTarget("main");
          if (cmd.type === "set-subagent-model") {
            // No dedicated event exists for this setting; update only after the
            // host accepted the command, never before transport succeeds.
            session.setSubagentModel(cmd.model ?? undefined);
          }
          if (cmd.type === "set-agent-model") {
            // Persistence/reload is asynchronous engine-side. Invalidate rather
            // than claiming a value the engine may reject or fail to persist.
            agentsCache.current = null;
          }
        })();
        return;
      }
      if (choice.kind === "prefill") {
        setPicker(null);
        setDraft(choice.draft);
        window.requestAnimationFrame(() => {
          document.querySelector<HTMLTextAreaElement>(".composer-input")?.focus();
        });
        return;
      }
      setPicker(null);
      void submitLine(choice.line);
    },
    [session, submitLine],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const emptyDraft = !draft.trim();
      const target = e.target as HTMLElement | null;
      const inInput =
        target?.tagName === "TEXTAREA" || target?.tagName === "INPUT";
      const inComposer = target?.classList.contains("composer-input") ?? false;

      // Ctrl/Cmd+T thinking
      if (e.key === "t" && (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault();
        session.dispatchTranscript({ type: "toggle-thinking-all" });
        return;
      }
      // Ctrl/Cmd+D density
      if (e.key === "d" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        const next = nextDensity(session.chrome.density);
        void session.send({ type: "run-slash", name: "details", args: next });
        return;
      }
      // Ctrl/Cmd+O fold all turns
      if (e.key === "o" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        session.foldAllTurns();
        return;
      }
      // Ctrl/Cmd+G external editor (TUI parity: composeInEditor)
      if (e.key.toLowerCase() === "g" && (e.ctrlKey || e.metaKey) && !e.shiftKey) {
        e.preventDefault();
        void (async () => {
          try {
            const res = await window.vibe.composeInEditor(draft);
            if (res.ok && res.text != null) {
              if (res.text.trim().length > 0) {
                setDraft(res.text);
              } else {
                // Empty file on exit → keep the prior draft (TUI parity: "kept" result)
                session.dispatchTranscript({
                  type: "notice",
                  text: "Editor draft was empty — kept your prior text.",
                  level: "info",
                });
              }
            } else if (res.reason === "failed") {
              session.dispatchTranscript({
                type: "notice",
                text: `The external editor failed${res.error ? `: ${res.error}` : ""} — kept your prior text.`,
                level: "warn",
              });
            } else if (res.reason === "no-editor") {
              session.dispatchTranscript({
                type: "notice",
                text: "Set $VISUAL or $EDITOR to compose in an external editor.",
                level: "warn",
              });
            } else if (res.reason === "kept") {
              session.dispatchTranscript({
                type: "notice",
                text: "External editor made no replacement — kept your prior text.",
                level: "info",
              });
            }
          } finally {
            window.requestAnimationFrame(() => {
              document.querySelector<HTMLTextAreaElement>(".composer-input")?.focus();
            });
          }
        })();
        return;
      }
      // ⇧⌘N continue latest
      if (e.key === "n" && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void continueLatest();
        return;
      }
      // ⌘K / Ctrl+K open slash by prefilling /
      if (e.key === "k" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        setDraft("/");
        return;
      }
      // Ctrl+P project grant
      if (e.key === "p" && (e.ctrlKey || e.metaKey) && emptyDraft && session.chrome.perms[0]) {
        e.preventDefault();
        void answerPerm("always-project");
        return;
      }
      // Ctrl+Y accept plan + yolo
      if (e.key === "y" && (e.ctrlKey || e.metaKey) && emptyDraft && session.chrome.plan && !session.chrome.perms.length) {
        e.preventDefault();
        void answerPlan("accept", undefined, "auto");
        return;
      }
      // Inspector toggle
      if (e.key === "i" && (e.ctrlKey || e.metaKey) && e.shiftKey) {
        e.preventDefault();
        session.setInspectorOpen((v) => !v);
        return;
      }

      // Permission y/a/n when empty draft (even in textarea)
      if (
        emptyDraft &&
        session.chrome.perms[0] &&
        (!inInput || inComposer) &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        if (e.key === "y" || e.key === "Y") {
          e.preventDefault();
          void answerPerm("once");
          return;
        }
        if (e.key === "a" || e.key === "A") {
          e.preventDefault();
          void answerPerm("always");
          return;
        }
        if (e.key === "n" || e.key === "N") {
          e.preventDefault();
          void answerPerm("deny");
          return;
        }
      }

      // Plan Enter accept when empty draft + not shift
      if (
        e.key === "Enter" &&
        emptyDraft &&
        session.chrome.plan &&
        !session.chrome.perms.length &&
        !e.shiftKey &&
        inComposer
      ) {
        e.preventDefault();
        void answerPlan("accept");
        return;
      }

      if (e.key === "Escape") {
        if (inInput && !inComposer) return;
        e.preventDefault();
        if (picker) {
          setPicker(null);
          return;
        }
        if (session.inspectorOpen) {
          session.setInspectorOpen(false);
          return;
        }
        if (session.jobsView) {
          session.setJobsView(false);
          return;
        }
        if (projectRailOpen && window.innerWidth < 900) {
          setProjectRailOpen(false);
          return;
        }
        if (draft.trim()) {
          // Clear draft first (TUI: Esc clears half-typed revision / draft)
          if (session.chrome.plan) {
            setDraft("");
            return;
          }
          setDraft("");
          return;
        }
        if (session.chrome.perms[0]) {
          void answerPerm("deny");
          return;
        }
        if (session.chrome.plan) {
          void answerPlan("keep-planning");
          return;
        }
        if (session.chrome.busy) {
          void session.send({ type: "abort" });
          return;
        }
      }

      // CLI Ctrl+C: clear a draft first, then gracefully quit. Do not capture
      // macOS Cmd+C — it must remain native copy for selected transcript/input.
      if (e.key === "c" && e.ctrlKey && !e.metaKey && !e.shiftKey) {
        e.preventDefault();
        if (draft.trim()) {
          setDraft("");
          return;
        }
        window.vibe.quit();
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [session, draft, continueLatest, answerPerm, answerPlan, picker, cwd, projectRailOpen]);

  const chrome = session.chrome;
  const ctxPct =
    chrome.ctxWindow > 0
      ? Math.min(100, Math.round((100 * chrome.ctxUsed) / chrome.ctxWindow))
      : null;
  const hotCtx = ctxPct != null && ctxPct >= 80;

  // Context fill moved out of the text run — it renders as the composer's
  // gauge ring (same data, richer presentation).
  const footerLeft = useMemo(
    () =>
      [
        changedSummary(session.transcript.changedFiles),
        formatUsage(chrome.usage),
        chrome.queuePending.length ? `queued ${chrome.queuePending.length}` : null,
        chrome.lastGate === "red" ? "gate RED" : null,
      ]
        .filter(Boolean)
        .join(" · "),
    [chrome, session.transcript.changedFiles],
  );

  const activeProject = projects.find((project) => project.cwd === cwd);
  const compactTasks = windowTasks(chrome.tasks, 8);
  const activeSessionTitle =
    activeProject?.sessions.find((item) => item.id === chrome.sessionId)?.title ??
    (chrome.goal || "New session");

  const activeSessionIndexed = projects.some((project) =>
    project.sessions.some((item) => item.id === chrome.sessionId),
  );

  useEffect(() => {
    if (session.ready && !chrome.busy && (!projects.length || !activeSessionIndexed)) {
      void refreshProjects();
    }
  }, [session.ready, chrome.busy, projects.length, activeSessionIndexed, refreshProjects]);

  if (!cwd) {
    return (
      <WelcomeGate
        booting={session.booting}
        bootError={session.bootError}
        pendingCwd={null}
        onOpenProject={() => void openProject()}
      />
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">Skip to conversation</a>
      <div className={`workspace${projectRailOpen ? " rail-open" : ""}${session.inspectorOpen ? " inspector-open" : ""}`}>
        <ProjectRail
          projects={projects}
          activeCwd={cwd}
          activeSessionId={chrome.sessionId}
          open={projectRailOpen}
          loading={projectsLoading}
          error={projectsError}
          busy={chrome.busy || session.booting}
          onClose={() => setProjectRailOpen(false)}
          onRetry={() => void refreshProjects()}
          onOpenProject={() => void openProject()}
          onNewSession={() => {
            if (window.innerWidth < 900) setProjectRailOpen(false);
            void newSession();
          }}
          onContinueLatest={() => {
            if (window.innerWidth < 900) setProjectRailOpen(false);
            void continueLatest();
          }}
          onResume={(projectCwd, id) => {
            if (window.innerWidth < 900) setProjectRailOpen(false);
            void resumeSession(projectCwd, id);
          }}
          onRenameSession={renameSession}
          onDeleteSession={(projectCwd, id) => removeSession(projectCwd, id, "delete")}
          onArchiveSession={(projectCwd, id) => removeSession(projectCwd, id, "archive")}
        />
        {projectRailOpen && (
          <button
            type="button"
            className="rail-scrim"
            aria-label="Close project rail"
            onClick={() => setProjectRailOpen(false)}
          />
        )}
        {session.inspectorOpen && (
          <button
            type="button"
            className="inspector-scrim"
            aria-label="Close inspector"
            onClick={() => session.setInspectorOpen(false)}
          />
        )}
        <div className={`content-inset${projectRailOpen ? "" : " is-expanded"}`}>
          <header className="topbar">
            <div className="topbar-leading">
              {!projectRailOpen && (
                <button type="button" className="icon-button no-drag" onClick={() => setProjectRailOpen(true)} aria-label="Show project rail">
                  <IconSidebar size={15} />
                </button>
              )}
              <h1 className="topbar-title" title={`${cwd}\n${activeSessionTitle}`}>
                <span className="topbar-project">{activeProject?.name ?? cwd.split("/").at(-1)}</span>
                <span className="topbar-separator" aria-hidden>
                  /
                </span>
                <span className="topbar-session">{activeSessionTitle}</span>
              </h1>
            </div>
            <div className="topbar-actions no-drag">
              <button
                type="button"
                className={`icon-button${session.jobsView ? " active" : ""}`}
                onClick={() => session.setJobsView((value) => !value)}
                title="Background jobs"
                aria-pressed={session.jobsView}
                aria-label={
                  chrome.jobs.filter((job) => job.status === "running").length
                    ? `Toggle background jobs, ${chrome.jobs.filter((job) => job.status === "running").length} running`
                    : "Toggle background jobs"
                }
              >
                <IconJobs size={14} />
                <span>
                  Jobs
                  {chrome.jobs.filter((job) => job.status === "running").length
                    ? ` ${chrome.jobs.filter((job) => job.status === "running").length}`
                    : ""}
                </span>
              </button>
              <button
                type="button"
                className={`icon-button${session.inspectorOpen ? " active" : ""}`}
                onClick={() => session.setInspectorOpen((value) => !value)}
                title="Session details"
                aria-pressed={session.inspectorOpen}
                aria-label={session.inspectorOpen ? "Hide session panel" : "Show session panel"}
              >
                <IconPanel size={14} />
                <span>Session</span>
              </button>
            </div>
          </header>
          <div className="main-column" id="main-content">
            <main
              className={`chat-column${
                !session.booting &&
                !(session.bootError && !session.ready) &&
                !session.jobsView &&
                session.transcript.blocks.length === 0 &&
                !chrome.busy
                  ? " is-empty"
                  : ""
              }`}
              aria-label="Conversation"
            >
            {!session.liveSidebar && (session.transcript.blocks.length > 0 || chrome.busy) && (
              <div className="context-line">
                {[
                  chrome.cwd,
                  gitSummary(chrome.git),
                  goalSuffix(chrome.goal, chrome.goalRun),
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            )}

            {session.booting ? (
              <SessionBoot cwd={cwd} />
            ) : session.bootError && !session.ready ? (
              <SessionBootError
                error={session.bootError}
                onRetry={() => void openProjectAt(cwd)}
                onOpenProject={() => void openProject()}
              />
            ) : session.jobsView ? (
              <JobsView jobs={chrome.jobs} />
            ) : session.transcript.blocks.length === 0 && !chrome.busy ? (
              <div className="transcript">
                <Splash
                  projectLabel={activeProject?.name ?? cwd.split("/").at(-1)}
                  branch={chrome.git?.branch ?? null}
                />
              </div>
            ) : (
              <TranscriptView
                turns={session.turns}
                hiddenCount={session.hiddenCount}
                revealPage={session.revealPage}
                foldedTurns={session.foldedTurns}
                density={chrome.density}
                itemWindowFor={session.itemWindowFor}
                onToggleBlock={(id) =>
                  session.dispatchTranscript({ type: "toggle", id })
                }
                onToggleTurn={(key) =>
                  session.setFoldedTurns((prev) => {
                    const n = new Set(prev);
                    if (n.has(key)) n.delete(key);
                    else n.add(key);
                    return n;
                  })
                }
                onShowEarlier={session.revealEarlier}
                onRevealTurnItems={session.revealTurnItems}
                followSignal={followSignal}
              />
            )}

            <div className="panels">
              {showOnboarding && (
                <OnboardingHint
                  onDismiss={() => setShowOnboarding(false)}
                  onOpenProviders={() => void submitLine("/providers")}
                />
              )}
              {chrome.perms[0] && (
                <PermissionCard
                  perm={chrome.perms[0]}
                  count={chrome.perms.length}
                  onDecide={(decision) => void answerPerm(decision)}
                />
              )}
              {chrome.plan && !chrome.perms.length && (
                <PlanCard
                  plan={chrome.plan}
                  onAccept={() => void answerPlan("accept")}
                  onAcceptYolo={() => void answerPlan("accept", undefined, "auto")}
                  onKeep={() => void answerPlan("keep-planning")}
                />
              )}
              {!session.liveSidebar && !session.inspectorOpen && hasUnfinishedTasks(chrome.tasks) && (
                <div className="card panel-strip">
                  <h3>Tasks · {chrome.tasks.filter((t) => t.status === "completed").length}/{chrome.tasks.length}</h3>
                  {compactTasks.lead > 0 && <div className="sidebar-line task-summary">{compactTasks.lead} done</div>}
                  {compactTasks.visible.map((t) => (
                    <div
                      key={t.id}
                      className={`task-row ${
                        t.status === "completed"
                          ? "done"
                          : t.status === "in_progress"
                            ? "active"
                            : "pending"
                      }`}
                    >
                      <span
                        className={`status-dot status-dot-${
                          t.status === "completed"
                            ? "done"
                            : t.status === "in_progress"
                              ? "active"
                              : "pending"
                        }`}
                        aria-hidden
                      />
                      <span>{t.title}</span>
                    </div>
                  ))}
                  {compactTasks.trailing > 0 && <div className="sidebar-line task-summary">+{compactTasks.trailing} more</div>}
                </div>
              )}
              {!session.liveSidebar && !session.inspectorOpen && chrome.subagents.length > 0 && (
                <div className="card panel-strip">
                  <h3>{(() => {
                    const done = chrome.subagents.filter((s) => s.status === "done").length;
                    return done > 0 && done < chrome.subagents.length
                      ? `Subagents · ${done}/${chrome.subagents.length} done`
                      : `Subagents · ${chrome.subagents.length}`;
                  })()}</h3>
                  {chrome.subagents.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      className="activity-button"
                      onClick={() => {
                        session.setSelectedSubagent(s.id);
                        session.setInspectorOpen(true);
                      }}
                    >
                      <div className="task-row subagent-tone">
                        <span
                          className={`status-dot status-dot-${s.status === "running" ? "active" : "done"}`}
                          aria-hidden
                        />
                        <span>{s.prompt.slice(0, 60)}</span>
                        {s.status === "running" && s.activity && (
                          <span className="subagent-activity"> · {s.activity}</span>
                        )}
                        {s.status === "done" && s.result && (
                          <span className="subagent-result"> ↳ {s.result.slice(0, 60)}</span>
                        )}
                        {s.elapsedMs != null && s.elapsedMs >= 1000 && (
                          <span className="subagent-elapsed">
                            {(s.elapsedMs / 1000).toFixed(s.elapsedMs >= 10_000 ? 0 : 1)}s
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {!(session.booting || (session.bootError && !session.ready)) && (
            <div className="composer-stack">
              {chrome.busy && <WorkingSpinner thinking={chrome.thinkingStream} />}
              <QueuePanel
                active={chrome.queueActive}
                pending={chrome.queuePending}
                onSteer={(id) => void session.send({ type: "steer", id })}
                onDequeue={(id) => void session.send({ type: "dequeue", id })}
              />
              {picker && (
                <CatalogModal
                  picker={picker}
                  autoFocusSearch={!draft.trim()}
                  onClose={() => {
                    setPicker(null);
                    setModelTarget("main");
                  }}
                  onChoose={onCatalogChoose}
                  onToggleModelTarget={
                    picker.kind === "models" && typeof picker.target === "string"
                      ? () => {
                          const next: "main" | "sub" = picker.target === "main" ? "sub" : "main";
                          setModelTarget(next);
                          setPicker({
                            ...picker,
                            target: next,
                            current: currentModelForTarget(
                              next,
                              chrome.model,
                              chrome.subagentModel,
                              agentsCache.current ?? [],
                            ),
                          });
                        }
                      : undefined
                  }
                />
              )}
              <Composer
                uiMode={session.uiMode}
                draft={draft}
                setDraft={setDraft}
                onSubmit={submitLine}
                catalogOpen={pickerMatchesDraft(picker, draft, modelTarget)}
                onCycleMode={session.cycleMode}
                onSelectMode={session.selectMode}
                disabled={!session.ready || session.booting}
                commandNames={chrome.commandNames}
                cwd={cwd}
                model={chrome.model}
                theme={chrome.theme}
                accent={chrome.accent}
                approvals={chrome.approvals}
                density={chrome.density}
                reasoning={chrome.reasoning}
                status={footerLeft}
                ctxPct={ctxPct}
                busy={chrome.busy}
                onAbort={() => void session.send({ type: "abort" })}
                onPasteError={session.showToast}
                emptyHome={
                  !session.jobsView &&
                  session.transcript.blocks.length === 0 &&
                  !chrome.busy
                }
              />
              {!session.jobsView &&
                session.transcript.blocks.length === 0 &&
                !chrome.busy && (
                  <StarterPills onStarter={(t) => void submitLine(t)} />
                )}
            </div>
            )}

            <div className="sr-only" aria-live="polite">
              {chrome.busy ? "Vibe Codr is working" : "Vibe Codr is idle"}
              {hotCtx ? `, context is ${ctxPct} percent full` : ""}
            </div>
          </main>

          {!session.inspectorOpen && session.liveSidebar && (
            <LiveSidebar
              chrome={chrome}
              onOpenSubagent={(id) => {
                session.setSelectedSubagent(id);
                session.setInspectorOpen(true);
              }}
            />
          )}
          {session.inspectorOpen && (
            <Inspector
              chrome={chrome}
              changedFiles={session.transcript.changedFiles}
              selectedSubagent={session.selectedSubagent}
              subagentStream={
                session.selectedSubagent
                  ? session.getSubagentStream(session.selectedSubagent)
                  : ""
              }
              onClose={() => session.setInspectorOpen(false)}
              onUndo={() => void session.send({ type: "run-slash", name: "undo", args: "" })}
              onRedo={() => void session.send({ type: "run-slash", name: "redo", args: "" })}
              onShowFile={(path) => {
                if (cwd) void window.vibe.showItem(`${cwd}/${path}`);
              }}
              onSelectSubagent={session.setSelectedSubagent}
            />
          )}
          </div>
        </div>
      </div>

      {session.toast && (
        <div className="toast" role="status" aria-live="polite" aria-atomic="true">
          {session.toast}
        </div>
      )}
    </div>
  );
}
