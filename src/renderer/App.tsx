import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { belowBreakpoint } from "../shared/breakpoints";
import {
  agentsPickerQuery,
  currentModelForTarget,
  type ModelPickerTarget,
  mcpPickerQuery,
  modelPicker,
  normalizeMcpServer,
  providersPickerQuery,
  skillsPickerFilter,
} from "../shared/catalog-draft";
import { densityLabel, nextDensity } from "../shared/density";
import { projectLabel } from "../shared/project-index";
import type { ProjectSummary } from "../shared/protocol";
import { isProjectSummaryArray } from "../shared/runtime-guards";
import { lineToCommands, routePendingPermLine } from "../shared/slash";
import { hasUnfinishedTasks } from "../shared/task-window";
import type {
  AgentInfo,
  McpServerInfo,
  ModelSummary,
  ProviderInfo,
  SkillInfo,
} from "../shared/types";
import { Composer, type ComposerMetric } from "./composer/Composer";
import { RequestGate } from "./hooks/request-gate";
import { useSession } from "./hooks/useSession";
import { IconJobs, IconPanel, IconSidebar } from "./icons";
import { ProjectRail } from "./layout/ProjectRail";
import { Splash } from "./layout/Splash";
import { SessionBoot, SessionBootError, WelcomeGate } from "./layout/WelcomeGate";
import { Inspector } from "./panels/Inspector";
import { JobsView } from "./panels/JobsView";
import { KeysOverlay } from "./panels/KeysOverlay";
import { PermissionCard, PlanCard, QueuePanel } from "./panels/LivePanels";
import { OnboardingHint } from "./panels/OnboardingHint";
import { type CatalogChoice, CatalogModal, type CatalogPickerState } from "./pickers/CatalogModal";
import {
  formatChromeSummary,
  formatGitLine,
  formatGoalLine,
  projectName,
  StatusDot,
} from "./primitives";
import { TranscriptView } from "./transcript/TranscriptView";

type Picker = CatalogPickerState | null;

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
  const pickerRetryRef = useRef<(() => void) | null>(null);
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [keysOpen, setKeysOpen] = useState(false);
  const [projectRailOpen, setProjectRailOpen] = useState(true);
  const [followSignal, setFollowSignal] = useState(0);
  const didRestoreProject = useRef(false);
  const projectRefreshGate = useRef(new RequestGate());
  const composerStackRef = useRef<HTMLDivElement>(null);
  const session = useSession(cwd);
  const showToastRef = useRef(session.showToast);
  showToastRef.current = session.showToast;

  // The composer overlays the transcript so output can continue to scroll
  // underneath it. Keep the transcript's bottom clearance tied to the actual
  // composer height, including multiline drafts and queued prompts.
  useEffect(() => {
    const stack = composerStackRef.current;
    const column = stack?.closest<HTMLElement>(".chat-column");
    if (!stack || !column || typeof ResizeObserver === "undefined") return;

    const syncClearance = () => {
      const height = Math.ceil(stack.getBoundingClientRect().height);
      column.style.setProperty("--composer-clearance", `${height + 24}px`);
    };

    syncClearance();
    const observer = new ResizeObserver(syncClearance);
    observer.observe(stack);
    return () => {
      observer.disconnect();
      column.style.removeProperty("--composer-clearance");
    };
  }, [session.booting, session.chrome.queuePending.length, session.transcript.blocks.length, picker]);

  useEffect(() => {
    const onPreviewToast = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (typeof detail === "string" && detail.trim()) showToastRef.current(detail);
    };
    window.addEventListener("vibe-preview-toast", onPreviewToast);
    return () => window.removeEventListener("vibe-preview-toast", onPreviewToast);
  }, []);

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
          let dismissed = false;
          try {
            dismissed = localStorage.getItem("vibe.onboardingDismissed") === "1";
          } catch {
            /* storage unavailable — fall back to per-session dismiss */
          }
          setShowOnboarding(!anyReady && !dismissed);
        }
      }
    },
    [session, refreshProjects, invalidateCatalogs],
  );

  const openProject = useCallback(async () => {
    if (session.chrome.busy) {
      session.showToast("Stop the current turn before switching projects.", "warn");
      return;
    }
    const path = await window.vibe.openProject();
    if (!path) return;
    await openProjectAt(path);
  }, [openProjectAt, session]);

  // Restore last project on launch; otherwise load recent projects for the welcome gate.
  useEffect(() => {
    if (didRestoreProject.current) return;
    didRestoreProject.current = true;
    try {
      const last = localStorage.getItem("vibe.lastCwd");
      if (last) {
        void openProjectAt(last);
        return;
      }
    } catch {
      /* ignore */
    }
    void refreshProjects();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep welcome-gate recents fresh when still on the cold-start screen.
  useEffect(() => {
    if (cwd || session.booting) return;
    if (projects.length > 0 || projectsLoading) return;
    void refreshProjects();
  }, [cwd, session.booting, projects.length, projectsLoading, refreshProjects]);

  const resumeSession = useCallback(
    async (projectCwd: string, id: string) => {
      if (session.chrome.busy) {
        session.showToast("Stop the current turn before switching sessions.", "warn");
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
      session.showToast("Stop the current turn before switching sessions.", "warn");
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
        session.showToast(res.error || "Rename failed", "error");
        return false;
      }
      await refreshProjects();
      return true;
    },
    [refreshProjects, session],
  );

  const renameProject = useCallback(
    async (projectCwd: string, name: string) => {
      const res = await window.vibe.renameProject({ cwd: projectCwd, name });
      if (!res.ok) {
        session.showToast(res.error || "Rename project failed", "error");
        return false;
      }
      await refreshProjects();
      session.showToast("Project renamed");
      return true;
    },
    [refreshProjects, session],
  );

  const archiveProject = useCallback(
    async (projectCwd: string) => {
      const res = await window.vibe.archiveProject({ cwd: projectCwd });
      if (!res.ok) {
        session.showToast(res.error || "Archive project failed", "error");
        return false;
      }
      await refreshProjects();
      session.showToast("Project archived");
      return true;
    },
    [refreshProjects, session],
  );

  const deleteProject = useCallback(
    async (projectCwd: string) => {
      if (projectCwd === cwd) {
        session.showToast("Open another project before deleting this project.", "warn");
        return false;
      }
      const res = await window.vibe.deleteProject({ cwd: projectCwd });
      if (!res.ok) {
        session.showToast(res.error || "Delete project failed", "error");
        return false;
      }
      await refreshProjects();
      session.showToast("Project deleted");
      return true;
    },
    [cwd, refreshProjects, session],
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
        session.showToast(res.error || `${mode === "delete" ? "Delete" : "Archive"} failed`, "error");
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

  // Centralized catalog presenter (I42): keeps the popover open across
  // loading → ready / error so RPC failures show inline instead of as a
  // vanishing toast. Each call site supplies its cache, fetch, and the
  // loading/ready picker descriptors.
  const presentCatalog = useCallback(
    async <T,>(opts: {
      cache: { current: T[] | null };
      fetch: () => Promise<{ ok: true; value: T[] } | { ok: false; error: string }>;
      loadingPicker: CatalogPickerState;
      readyPicker: (items: T[]) => CatalogPickerState;
      cancelled: () => boolean;
    }): Promise<boolean> => {
      const generation = catalogGeneration.current;
      let items = opts.cache.current;
      if (!items) {
        setPicker({ ...opts.loadingPicker, status: "loading" });
        pickerRetryRef.current = () => {
          void presentCatalog(opts);
        };
        const res = await opts.fetch();
        if (opts.cancelled() || generation !== catalogGeneration.current) return false;
        if (!res.ok) {
          setPicker({ ...opts.loadingPicker, status: "error", error: res.error });
          return false;
        }
        items = res.value;
        opts.cache.current = items;
      }
      if (opts.cancelled() || generation !== catalogGeneration.current) return false;
      setPicker(opts.readyPicker(items));
      return true;
    },
    [],
  );

  const retryCatalog = useCallback(() => {
    pickerRetryRef.current?.();
  }, []);

  const openModelsPicker = useCallback(
    async (target: ModelPickerTarget, query = ""): Promise<boolean> => {
      return presentCatalog<ModelSummary>({
        cache: modelsCache,
        fetch: async () => {
          const res = await window.vibe.rpc("listModels");
          return res.ok ? { ok: true, value: res.value as ModelSummary[] } : { ok: false, error: res.error };
        },
        loadingPicker: { kind: "models", items: [], target, query },
        readyPicker: (items) => {
          const chrome = chromeRef.current;
          return {
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
          };
        },
        cancelled: () => false,
      });
    },
    [presentCatalog],
  );

  // Compose in $VISUAL/$EDITOR (TUI parity: composeInEditor). Reused by the
  // ⌘G shortcut and the composer insert menu so the affordance is discoverable
  // beyond keyboard-only users (I27).
  const composeInEditor = useCallback(async () => {
    try {
      const res = await window.vibe.composeInEditor(draft);
      if (res.ok && res.text != null) {
        if (res.text.trim().length > 0) {
          setDraft(res.text);
        } else {
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
  }, [draft, session]);

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
        setKeysOpen(true);
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
        return presentCatalog<ProviderInfo>({
          cache: providersCache,
          fetch: async () => {
            const res = await window.vibe.rpc("listProviders");
            return res.ok ? { ok: true, value: res.value as ProviderInfo[] } : { ok: false, error: res.error };
          },
          loadingPicker: { kind: "providers", items: [] },
          readyPicker: (items) => ({ kind: "providers", items }),
          cancelled: () => catalogRequestGeneration !== catalogGeneration.current,
        });
      }
      if (trimmed === "/agents") {
        return presentCatalog<AgentInfo>({
          cache: agentsCache,
          fetch: async () => {
            const res = await window.vibe.rpc("listAgents");
            return res.ok ? { ok: true, value: res.value as AgentInfo[] } : { ok: false, error: res.error };
          },
          loadingPicker: { kind: "agents", items: [] },
          readyPicker: (items) => ({ kind: "agents", items }),
          cancelled: () => catalogRequestGeneration !== catalogGeneration.current,
        });
      }
      if (trimmed === "/skills" || trimmed.startsWith("/skills ")) {
        const skillsQuery = trimmed.slice("/skills".length).trim();
        return presentCatalog<SkillInfo>({
          cache: skillsCache,
          fetch: async () => {
            const res = await window.vibe.rpc("listSkills");
            return res.ok ? { ok: true, value: res.value as SkillInfo[] } : { ok: false, error: res.error };
          },
          loadingPicker: { kind: "skills", items: [], query: skillsQuery },
          readyPicker: (items) => ({ kind: "skills", items, query: skillsQuery }),
          cancelled: () => catalogRequestGeneration !== catalogGeneration.current,
        });
      }
      if (trimmed === "/mcp") {
        return presentCatalog<McpServerInfo>({
          cache: mcpCache,
          fetch: async () => {
            const res = await window.vibe.rpc("listMcp");
            return res.ok
              ? { ok: true, value: asMcpList(res.value) }
              : { ok: false, error: res.error };
          },
          loadingPicker: { kind: "mcp", items: [] },
          readyPicker: (items) => ({ kind: "mcp", items }),
          cancelled: () => catalogRequestGeneration !== catalogGeneration.current,
        });
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
    [session, answerPerm, answerPlan, openModelsPicker, presentCatalog],
  );

  // Live draft catalogs — open/update pickers while typing (TUI parity).
  useEffect(() => {
    let cancelled = false;

    const sync = async () => {
      const cancelledFn = () => cancelled;
      const pick = modelPicker(draft, modelTarget);
      if (pick) {
        await presentCatalog<ModelSummary>({
          cache: modelsCache,
          fetch: async () => {
            const res = await window.vibe.rpc("listModels");
            return res.ok ? { ok: true, value: res.value as ModelSummary[] } : { ok: false, error: res.error };
          },
          loadingPicker: { kind: "models", items: [], target: pick.target, query: pick.query },
          readyPicker: (items) => {
            const chrome = chromeRef.current;
            return {
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
            };
          },
          cancelled: cancelledFn,
        });
        return;
      }

      const provQ = providersPickerQuery(draft);
      if (provQ !== null) {
        await presentCatalog<ProviderInfo>({
          cache: providersCache,
          fetch: async () => {
            const res = await window.vibe.rpc("listProviders");
            return res.ok ? { ok: true, value: res.value as ProviderInfo[] } : { ok: false, error: res.error };
          },
          loadingPicker: { kind: "providers", items: [], query: provQ },
          readyPicker: (items) => ({ kind: "providers", items, query: provQ }),
          cancelled: cancelledFn,
        });
        return;
      }

      const agentsQ = agentsPickerQuery(draft);
      if (agentsQ !== null) {
        await presentCatalog<AgentInfo>({
          cache: agentsCache,
          fetch: async () => {
            const res = await window.vibe.rpc("listAgents");
            return res.ok ? { ok: true, value: res.value as AgentInfo[] } : { ok: false, error: res.error };
          },
          loadingPicker: { kind: "agents", items: [], query: agentsQ },
          readyPicker: (items) => ({ kind: "agents", items, query: agentsQ }),
          cancelled: cancelledFn,
        });
        return;
      }

      const skillsQ = skillsPickerFilter(draft);
      if (skillsQ !== null) {
        await presentCatalog<SkillInfo>({
          cache: skillsCache,
          fetch: async () => {
            const res = await window.vibe.rpc("listSkills");
            return res.ok ? { ok: true, value: res.value as SkillInfo[] } : { ok: false, error: res.error };
          },
          loadingPicker: { kind: "skills", items: [], query: skillsQ },
          readyPicker: (items) => ({ kind: "skills", items, query: skillsQ }),
          cancelled: cancelledFn,
        });
        return;
      }

      const mcpQ = mcpPickerQuery(draft);
      if (mcpQ !== null) {
        await presentCatalog<McpServerInfo>({
          cache: mcpCache,
          fetch: async () => {
            const res = await window.vibe.rpc("listMcp");
            return res.ok ? { ok: true, value: asMcpList(res.value) } : { ok: false, error: res.error };
          },
          loadingPicker: { kind: "mcp", items: [], query: mcpQ },
          readyPicker: (items) => ({ kind: "mcp", items, query: mcpQ }),
          cancelled: cancelledFn,
        });
        return;
      }

      // Typed away from a catalog draft — close. Empty draft leaves submit-opened pickers alone.
      if (draft.trim()) setPicker(null);
    };

    void sync();
    return () => {
      cancelled = true;
    };
  }, [draft, modelTarget, session.chrome.model, session.chrome.subagentModel, presentCatalog]);

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
        session.showToast(`Density · ${densityLabel(next)}`);
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
        void composeInEditor();
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
        if (keysOpen) {
          setKeysOpen(false);
          return;
        }
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
        if (projectRailOpen && belowBreakpoint("tablet")) {
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
  }, [session, draft, continueLatest, answerPerm, answerPlan, composeInEditor, picker, keysOpen, cwd, projectRailOpen]);

  const chrome = session.chrome;
  const ctxPct =
    chrome.ctxWindow > 0
      ? Math.min(100, Math.round((100 * chrome.ctxUsed) / chrome.ctxWindow))
      : null;
  const hotCtx = ctxPct != null && ctxPct >= 80;

  // Usage / files as composer chips. Gate has its own banner; queue has the tray.
  const composerMetrics = useMemo((): ComposerMetric[] => {
    const chips: ComposerMetric[] = [];
    const changed = changedSummary(session.transcript.changedFiles);
    if (changed) chips.push({ key: "files", label: changed, title: changed });
    const usage = formatUsage(chrome.usage);
    if (usage) chips.push({ key: "usage", label: usage, title: usage });
    return chips;
  }, [chrome.usage, session.transcript.changedFiles]);

  const activeProject = projects.find((project) => project.cwd === cwd);
  const activeTask = chrome.tasks.find((t) => t.status === "in_progress");
  const taskDone = chrome.tasks.filter((t) => t.status === "completed").length;
  const runningJobs = chrome.jobs.filter((job) => job.status === "running").length;
  const runningSubagents = chrome.subagents.filter((s) => s.status === "running").length;
  const doneSubagents = chrome.subagents.filter((s) => s.status === "done").length;
  const activeSessionTitle =
    activeProject?.sessions.find((item) => item.id === chrome.sessionId)?.title ??
    (chrome.goal || "New session");
  const topbarMetaChips = [
    chrome.queuePending.length
      ? { key: "queue", label: `queued ${chrome.queuePending.length}`, tone: "neutral" as const }
      : null,
    hotCtx && ctxPct != null
      ? { key: "ctx", label: `ctx ${ctxPct}%`, tone: "warn" as const }
      : null,
  ].filter((chip): chip is { key: string; label: string; tone: "neutral" | "warn" } => chip != null);
  const topbarMetaTitle = [
    ...topbarMetaChips.map((chip) => chip.label),
    ...composerMetrics.map((metric) => metric.label),
  ].join(" · ");
  const planPending = !!chrome.plan && !chrome.perms.length;
  const showGateBanner = chrome.lastGate === "red" && !chrome.busy;
  const contextSummary = formatChromeSummary({
    git: formatGitLine(chrome.git),
    goal: formatGoalLine(chrome.goal, chrome.goalRun, { style: "context" }),
  });

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
        recentProjects={projects}
        projectsLoading={projectsLoading}
        projectsError={projectsError}
        onOpenProject={() => void openProject()}
        onOpenRecent={(path) => void openProjectAt(path)}
        onRetryProjects={() => void refreshProjects()}
      />
    );
  }

  return (
    <div className="app-shell">
      <nav className="skip-links" aria-label="Skip links">
        <a className="skip-link" href="#main-content">Skip to conversation</a>
        <a className="skip-link" href="#composer">Skip to composer</a>
        {projectRailOpen ? (
          <a className="skip-link" href="#project-rail">Skip to projects</a>
        ) : null}
        {session.inspectorOpen ? (
          <a className="skip-link" href="#session-panel">Skip to session panel</a>
        ) : null}
      </nav>
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
            if (belowBreakpoint("tablet")) setProjectRailOpen(false);
            void newSession();
          }}
          onContinueLatest={() => {
            if (belowBreakpoint("tablet")) setProjectRailOpen(false);
            void continueLatest();
          }}
          onResume={(projectCwd, id) => {
            if (belowBreakpoint("tablet")) setProjectRailOpen(false);
            void resumeSession(projectCwd, id);
          }}
          onRenameProject={renameProject}
          onArchiveProject={archiveProject}
          onDeleteProject={deleteProject}
          onRenameSession={renameSession}
          onDeleteSession={(projectCwd, id) => removeSession(projectCwd, id, "delete")}
          onArchiveSession={(projectCwd, id) => removeSession(projectCwd, id, "archive")}
        />
        {projectRailOpen && (
          <button
            type="button"
            className="drawer-scrim"
            data-drawer="start"
            aria-label="Close project rail"
            onClick={() => setProjectRailOpen(false)}
          />
        )}
        {session.inspectorOpen && (
          <button
            type="button"
            className="drawer-scrim"
            data-drawer="end"
            aria-label="Close inspector"
            onClick={() => session.setInspectorOpen(false)}
          />
        )}
        <div className={`content-inset${projectRailOpen ? "" : " is-expanded"}`}>
          <header className="topbar">
            <div className="topbar-leading">
              {!projectRailOpen && (
                <button
                  type="button"
                  className="icon-button no-drag"
                  onClick={() => setProjectRailOpen(true)}
                  aria-label="Show project rail"
                  aria-expanded={projectRailOpen}
                  aria-controls="project-rail"
                >
                  <IconSidebar size={15} />
                </button>
              )}
              {!projectRailOpen && (
                <span className="topbar-brand" aria-hidden={false}>
                  Vibe Codr
                </span>
              )}
              <h1 className="topbar-title" title={`${cwd}\n${activeSessionTitle}`}>
                <span className="topbar-project">
                  {activeProject
                    ? projectLabel(activeProject, projects)
                    : projectName(cwd)}
                </span>
                <span className="topbar-separator" aria-hidden>
                  /
                </span>
                <span className="topbar-session">{activeSessionTitle}</span>
              </h1>
              {topbarMetaChips.length > 0 && (
                <div className="topbar-meta no-drag" title={topbarMetaTitle || undefined}>
                  {topbarMetaChips.map((chip) => (
                    <span
                      key={chip.key}
                      className={`topbar-meta-chip${chip.tone === "warn" ? " is-warn" : ""}`}
                    >
                      {chip.label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="topbar-actions no-drag">
              <button
                type="button"
                className={`icon-button${session.jobsView ? " active" : ""}`}
                onClick={() => session.setJobsView((value) => !value)}
                title={
                  runningJobs
                    ? `Background jobs · ${runningJobs} running`
                    : "Background jobs"
                }
                aria-pressed={session.jobsView}
                aria-label={
                  runningJobs
                    ? `Toggle background jobs, ${runningJobs} running`
                    : "Toggle background jobs"
                }
              >
                <IconJobs size={14} />
                <span className="topbar-action-label">Jobs</span>
                {runningJobs > 0 ? (
                  <span className="topbar-action-count">{runningJobs}</span>
                ) : null}
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
                <span className="topbar-action-label">Session</span>
              </button>
            </div>
          </header>
          <div className="main-column" id="main-content">
            <main
              className={`chat-column${
                !session.booting &&
                !(session.bootError && !session.ready) &&
                session.transcript.blocks.length === 0 &&
                !chrome.busy
                  ? " is-empty"
                  : ""
              }`}
              aria-label="Conversation"
            >
            {(session.transcript.blocks.length > 0 || chrome.busy) && contextSummary && (
              <div className="context-line">
                {contextSummary}
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
            ) : session.transcript.blocks.length === 0 && !chrome.busy ? (
              <div className="transcript">
                <Splash />
              </div>
            ) : (
              <TranscriptView
                turns={session.turns}
                hiddenCount={session.hiddenCount}
                revealPage={session.revealPage}
                foldedTurns={session.foldedTurns}
                density={chrome.density}
                theme={chrome.theme}
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

            {session.jobsView && (
              <div className="jobs-drawer-root">
                <button
                  type="button"
                  className="jobs-drawer-backdrop"
                  aria-label="Dismiss jobs"
                  onClick={() => session.setJobsView(false)}
                />
                <div
                  className="jobs-drawer"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="jobs-drawer-title"
                >
                  <JobsView
                    jobs={chrome.jobs}
                    onClose={() => session.setJobsView(false)}
                  />
                </div>
              </div>
            )}

            <div className="panels">
              {showOnboarding && !chrome.perms[0] && !planPending && (
                <OnboardingHint
                  onDismiss={() => {
                    try {
                      localStorage.setItem("vibe.onboardingDismissed", "1");
                    } catch {
                      /* ignore */
                    }
                    setShowOnboarding(false);
                  }}
                  onOpenProviders={() => void submitLine("/providers")}
                />
              )}
              {showGateBanner && (
                <div className="notice error gate-banner" role="alert">
                  Verify gate failed — review the last turn before continuing
                </div>
              )}
              {chrome.perms[0] && (
                <PermissionCard
                  perm={chrome.perms[0]}
                  count={chrome.perms.length}
                  onDecide={(decision, feedback) => void answerPerm(decision, feedback)}
                />
              )}
              {planPending && (
                <PlanCard
                  plan={chrome.plan!}
                  hasDraft={!!draft.trim()}
                  onAccept={() => void answerPlan("accept")}
                  onAcceptYolo={() => void answerPlan("accept", undefined, "auto")}
                  onKeep={() => void answerPlan("keep-planning")}
                />
              )}
              {!session.inspectorOpen &&
                (hasUnfinishedTasks(chrome.tasks) || chrome.subagents.length > 0) && (
                <div className="panel-strip-compact" role="group" aria-label="Live activity">
                  {hasUnfinishedTasks(chrome.tasks) && (
                    <button
                      type="button"
                      className="panel-strip-chip"
                      onClick={() => session.setInspectorOpen(true)}
                      title="Open session panel for full task list"
                    >
                      <StatusDot status={activeTask ? "active" : "pending"} />
                      <span>
                        Tasks · {taskDone}/{chrome.tasks.length}
                        {activeTask ? ` · ${activeTask.title}` : ""}
                      </span>
                    </button>
                  )}
                  {chrome.subagents.length > 0 && (
                    <button
                      type="button"
                      className="panel-strip-chip"
                      onClick={() => {
                        const focus =
                          chrome.subagents.find((s) => s.status === "running") ?? chrome.subagents[0];
                        if (focus) session.setSelectedSubagent(focus.id);
                        session.setInspectorOpen(true);
                      }}
                      title="Open session panel for subagents"
                    >
                      <StatusDot status={runningSubagents > 0 ? "active" : "done"} />
                      <span>
                        {runningSubagents > 0
                          ? `Subagents · ${runningSubagents} running`
                          : doneSubagents > 0 && doneSubagents < chrome.subagents.length
                            ? `Subagents · ${doneSubagents}/${chrome.subagents.length} done`
                            : `Subagents · ${chrome.subagents.length}`}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {!(session.booting || (session.bootError && !session.ready)) && (
            <div className="composer-stack" id="composer" ref={composerStackRef}>
              <QueuePanel
                pending={chrome.queuePending}
                onSteer={(id) => void session.send({ type: "steer", id })}
                onDequeue={(id) => void session.send({ type: "dequeue", id })}
              />
              {picker && (
                <CatalogModal
                  picker={picker}
                  anchorRef={composerStackRef}
                  autoFocusSearch={!draft.trim()}
                  draftLinked={!!draft.trim()}
                  onClose={() => {
                    setPicker(null);
                    setModelTarget("main");
                  }}
                  onChoose={onCatalogChoose}
                  onRetry={retryCatalog}
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
                metrics={composerMetrics}
                ctxPct={ctxPct}
                busy={chrome.busy}
                onAbort={() => void session.send({ type: "abort" })}
                onCycleDensity={() => {
                  const next = nextDensity(chrome.density);
                  void session.send({ type: "run-slash", name: "details", args: next });
                  session.showToast(`Density · ${densityLabel(next)}`);
                }}
                onPasteError={session.showToast}
                onOpenModel={() => void openModelsPicker("main")}
                onOpenInspector={() => session.setInspectorOpen(true)}
                onEditInEditor={() => void composeInEditor()}
                planPending={planPending}
                emptyHome={
                  session.transcript.blocks.length === 0 &&
                  !chrome.busy
                }
              />
            </div>
            )}

            <div className="sr-only" aria-live="polite">
              {chrome.busy ? "Vibe Codr is working" : "Vibe Codr is idle"}
              {hotCtx ? `, context is ${ctxPct} percent full` : ""}
            </div>
          </main>

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
              cwd={cwd}
              onClose={() => session.setInspectorOpen(false)}
              onUndo={() => void session.send({ type: "run-slash", name: "undo", args: "" })}
              onRedo={() => void session.send({ type: "run-slash", name: "redo", args: "" })}
              onRevealFile={(path) => {
                if (!cwd) return;
                const absolute = path.startsWith("/") || /^[A-Za-z]:[\\/]/.test(path)
                  ? path
                  : `${cwd}/${path}`;
                void window.vibe.showItem(absolute);
              }}
              onSelectSubagent={session.setSelectedSubagent}
            />
          )}
          </div>
        </div>
      </div>

      {keysOpen && <KeysOverlay onClose={() => setKeysOpen(false)} />}

      {session.toast && (
        <div
          className={`toast toast-${session.toast.severity}`}
          role="status"
          aria-live={session.toast.severity === "error" ? "assertive" : "polite"}
          aria-atomic="true"
          data-severity={session.toast.severity}
        >
          <button
            type="button"
            className="toast-dismiss"
            onClick={() => session.dismissToast()}
            aria-label="Dismiss notification"
            title="Dismiss"
          >
            {session.toast.message}
          </button>
        </div>
      )}
    </div>
  );
}
