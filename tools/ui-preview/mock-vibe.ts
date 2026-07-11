/**
 * Browser-preview mock of the `window.vibe` preload bridge.
 *
 * Lets the real renderer run in a plain Vite dev server (no Electron, no
 * engine host) so UI states can be exercised and screenshotted. Scenarios are
 * selected with `?scenario=<name>` and an optional `&theme=<name>`:
 *
 *   welcome     — no project open (WelcomeGate)
 *   splash      — project open, empty session (wordmark + centered composer + pill starters)
 *   chat        — a finished coding turn: tools, diff, markdown reply
 *   busy        — mid-turn: spinner, live tool, thinking, subagents, tasks
 *   permission  — pending permission card
 *   plan        — plan-approval card with sources + assumptions
 *   slash       — slash-command palette open
 *   catalog     — model catalog popover open
 *   mention     — `@` file-mention popover open
 *   jobs        — background jobs view
 *   inspector   — session inspector rail open
 *
 * This file never ships in the app bundle — it is dev tooling only.
 */
import type { UIEvent } from "../../src/shared/events";
import type { EngineSnapshot, JobInfo, Task } from "../../src/shared/types";
import type { ProjectSummary } from "../../src/shared/protocol";

type EventCb = (event: unknown) => void;

const params = new URLSearchParams(window.location.search);
const scenario = params.get("scenario") ?? "chat";
const themeOverride = params.get("theme");

const CWD = "/Users/rob/Code/acme-web";
const SID = "sess_9f2ka81c";
const now = Date.now();
const MIN = 60_000;
const HOUR = 3_600_000;

/* ────────────────────────── canned data ────────────────────────── */

const PROJECTS: ProjectSummary[] = [
  {
    cwd: CWD,
    name: "acme-web",
    updatedAt: now - 2 * MIN,
    sessions: [
      { id: SID, title: "Dark mode for settings", model: "anthropic/claude-4.6-opus", mode: "execute", goal: null, createdAt: now - 3 * HOUR, updatedAt: now - 2 * MIN },
      { id: "sess_flaky01", title: "Fix flaky auth tests", model: "anthropic/claude-4.6-opus", mode: "execute", goal: null, createdAt: now - 26 * HOUR, updatedAt: now - 25 * HOUR },
      { id: "sess_billing", title: "Refactor billing webhooks", model: "openai/gpt-6.2-codex", mode: "plan", goal: null, createdAt: now - 4 * 24 * HOUR, updatedAt: now - 3 * 24 * HOUR },
    ],
  },
  {
    cwd: "/Users/rob/Code/vibe-codr",
    name: "vibe-codr",
    updatedAt: now - 8 * HOUR,
    sessions: [
      { id: "sess_tui4", title: "OpenTUI scroll anchoring", model: "anthropic/claude-4.6-opus", mode: "execute", goal: null, createdAt: now - 9 * HOUR, updatedAt: now - 8 * HOUR },
      { id: "sess_tui5", title: "Slash palette fuzzy match", model: "anthropic/claude-4.6-opus", mode: "execute", goal: null, createdAt: now - 2 * 24 * HOUR, updatedAt: now - 2 * 24 * HOUR },
    ],
  },
  {
    cwd: "/Users/rob/Code/dotfiles",
    name: "dotfiles",
    updatedAt: now - 6 * 24 * HOUR,
    sessions: [
      { id: "sess_dot1", title: "Ghostty + tmux keymaps", model: "anthropic/claude-4.5-sonnet", mode: "execute", goal: null, createdAt: now - 6 * 24 * HOUR, updatedAt: now - 6 * 24 * HOUR },
    ],
  },
];

const MODELS = [
  { id: "claude-4.6-opus", providerId: "anthropic", name: "Claude 4.6 Opus", contextWindow: 200_000 },
  { id: "claude-4.5-sonnet", providerId: "anthropic", name: "Claude 4.5 Sonnet", contextWindow: 200_000 },
  { id: "gpt-6.2-codex", providerId: "openai", name: "GPT-6.2 Codex", contextWindow: 400_000 },
  { id: "gpt-6-mini", providerId: "openai", name: "GPT-6 mini", contextWindow: 200_000 },
  { id: "gemini-3.5-pro", providerId: "google", name: "Gemini 3.5 Pro", contextWindow: 1_000_000 },
  { id: "glm-5.2", providerId: "zai", name: "GLM 5.2", contextWindow: 200_000 },
  { id: "qwen4-coder", providerId: "ollama", name: "Qwen4 Coder (local)", contextWindow: 128_000 },
];

const PROVIDERS = [
  { id: "anthropic", configured: true, keyless: false, env: ["ANTHROPIC_API_KEY"] },
  { id: "openai", configured: true, keyless: false, env: ["OPENAI_API_KEY"] },
  { id: "google", configured: false, keyless: false, env: ["GEMINI_API_KEY"] },
  { id: "zai", configured: false, keyless: false, env: ["ZAI_API_KEY"] },
  { id: "ollama", configured: true, keyless: true, env: [] },
];

const AGENTS = [
  { name: "reviewer", description: "Reviews diffs for correctness and style", model: null, mode: "plan" as const },
  { name: "test-writer", description: "Writes focused unit tests for changed code", model: "anthropic/claude-4.5-sonnet", mode: "execute" as const },
];

const SKILLS = [
  { name: "changelog", description: "Draft a changelog entry from recent commits" },
  { name: "release", description: "Cut a release: bump, tag, notes, publish" },
];

const MCP = [
  { name: "github", connected: true, configured: true, toolCount: 12, resourceCount: 2, promptCount: 0 },
  { name: "postgres", connected: false, configured: true, toolCount: 6, resourceCount: 0, promptCount: 0, error: "connection refused" },
];

const FILES = [
  "src/settings/Appearance.tsx",
  "src/settings/SettingsPage.tsx",
  "src/settings/index.ts",
  "src/app/App.tsx",
  "src/app/theme/ThemeProvider.tsx",
  "src/app/theme/tokens.css",
  "src/components/Button.tsx",
  "src/components/Switch.tsx",
  "package.json",
  "README.md",
];

const JOBS: JobInfo[] = [
  {
    id: "job_dev",
    command: "npm run dev",
    status: "running",
    exitCode: null,
    pid: 48123,
    servers: ["http://localhost:3000"],
    outputTail: "  VITE v6.3.5  ready in 412 ms\n\n  ➜  Local:   http://localhost:3000/\n  ➜  Network: use --host to expose\n  ➜  press h + enter to show help",
  },
  {
    id: "job_test",
    command: "npm run test:watch -- settings",
    status: "exited",
    exitCode: 0,
    pid: 48200,
    servers: [],
    outputTail: " ✓ src/settings/Appearance.test.tsx (9 tests) 214ms\n ✓ src/settings/SettingsPage.test.tsx (3 tests) 88ms\n\n Test Files  2 passed (2)\n      Tests  12 passed (12)\n   Duration  1.42s",
  },
];

const TASKS_DONE: Task[] = [
  { id: "t1", title: "Locate settings appearance panel", status: "completed" },
  { id: "t2", title: "Add theme toggle wired to ThemeProvider", status: "completed" },
  { id: "t3", title: "Persist preference and run tests", status: "completed" },
];

const TASKS_LIVE: Task[] = [
  { id: "t1", title: "Map current webhook handlers", status: "completed" },
  { id: "t2", title: "Introduce idempotency keys on ingest", status: "in_progress" },
  { id: "t3", title: "Backfill dedupe table migration", status: "pending" },
  { id: "t4", title: "Update retry policy + integration tests", status: "pending" },
];

const DIFF = [
  "@@ -12,7 +12,14 @@ export function Appearance() {",
  "   const { theme, setTheme } = useTheme();",
  "-  return (",
  "-    <section className=\"appearance\">",
  "-      <h2>Appearance</h2>",
  "+  const options = [\"system\", \"light\", \"dark\"] as const;",
  "+  return (",
  "+    <section className=\"appearance\">",
  "+      <h2>Appearance</h2>",
  "+      <SegmentedControl",
  "+        value={theme}",
  "+        options={options}",
  "+        onChange={setTheme}",
  "+      />",
  "     </section>",
  "   );",
].join("\n");

/* ────────────────────────── snapshot ────────────────────────── */

function baseSnapshot(): EngineSnapshot {
  return {
    sessionId: SID,
    model: "anthropic/claude-4.6-opus",
    mode: "execute",
    goal: null,
    history: [],
    tasks: [],
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUSD: 0 },
    busy: false,
    theme: themeOverride ?? "default",
    accentColor: "",
    details: "normal",
    mouse: false,
    approvalMode: "ask",
    commandNames: [
      "help", "model", "models", "providers", "agents", "skills", "mcp",
      "theme", "accent", "details", "reasoning", "approvals", "clear", "new",
      "resume", "jobs", "keys", "undo", "redo", "goal", "compact", "review", "exit",
    ],
    subagentModel: undefined,
    reasoning: "medium",
    git: { branch: "main", dirty: 3, ahead: 1, behind: 0, worktree: false },
  };
}

/* ────────────────────────── event bus ────────────────────────── */

const listeners = new Set<EventCb>();
let timelineStarted = false;

function emit(event: UIEvent): void {
  for (const cb of [...listeners]) cb(event);
}

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

function settle(): void {
  (window as unknown as { __previewSettled: boolean }).__previewSettled = true;
}

function setComposerDraft(value: string): void {
  const el = document.querySelector<HTMLTextAreaElement>(".composer-input");
  if (!el) return;
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
  setter?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.focus();
}

function pressComposerEnter(): void {
  const el = document.querySelector<HTMLTextAreaElement>(".composer-input");
  el?.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
}

/* ────────────────────────── scenario timelines ────────────────────────── */

async function streamAssistant(text: string, chunk = 48): Promise<void> {
  for (let i = 0; i < text.length; i += chunk) {
    emit({ type: "assistant-text-delta", sessionId: SID, delta: text.slice(i, i + chunk) });
    await sleep(4);
  }
}

async function chatTurn(): Promise<void> {
  emit({ type: "user-message", sessionId: SID, text: "Add dark mode support to the settings page — respect the system preference and let users override it." });
  await sleep(40);

  emit({ type: "reasoning-delta", sessionId: SID, delta: "Scanning the settings tree for the appearance panel and the theme provider so the toggle lands in the right place." });
  await sleep(60);

  emit({ type: "tool-call-started", sessionId: SID, toolCallId: "tc_grep", toolName: "grep", input: { pattern: "ThemeProvider", path: "src" } });
  await sleep(90);
  emit({ type: "tool-call-finished", sessionId: SID, toolCallId: "tc_grep", toolName: "grep", isError: false, output: "src/app/theme/ThemeProvider.tsx:18\nsrc/app/App.tsx:9\nsrc/settings/Appearance.tsx:4" });

  emit({ type: "tool-call-started", sessionId: SID, toolCallId: "tc_read", toolName: "read", input: { path: "src/settings/Appearance.tsx" } });
  await sleep(80);
  emit({ type: "tool-call-finished", sessionId: SID, toolCallId: "tc_read", toolName: "read", isError: false, output: "export function Appearance() {\n  const { theme, setTheme } = useTheme();\n  return (\n    <section className=\"appearance\">\n      <h2>Appearance</h2>\n    </section>\n  );\n}" });

  emit({ type: "tool-call-started", sessionId: SID, toolCallId: "tc_edit", toolName: "edit", input: { path: "src/settings/Appearance.tsx" } });
  await sleep(70);
  emit({ type: "tool-call-finished", sessionId: SID, toolCallId: "tc_edit", toolName: "edit", isError: false, output: "edited src/settings/Appearance.tsx" });
  emit({ type: "file-changed", sessionId: SID, toolCallId: "tc_edit", path: "src/settings/Appearance.tsx", action: "edit", diff: DIFF, added: 11, removed: 4 });
  await sleep(30);

  emit({ type: "checkpoint-created", id: "cp_1", label: "before settings dark-mode edit" });

  emit({ type: "tool-call-started", sessionId: SID, toolCallId: "tc_test", toolName: "bash", input: { command: "npm run test -- settings" } });
  await sleep(1300);
  emit({ type: "tool-call-finished", sessionId: SID, toolCallId: "tc_test", toolName: "bash", isError: false, output: " ✓ src/settings/Appearance.test.tsx (9 tests) 214ms\n ✓ src/settings/SettingsPage.test.tsx (3 tests) 88ms\n\n Test Files  2 passed (2)\n      Tests  12 passed (12)" });
  await sleep(40);

  await streamAssistant(
    [
      "Dark mode is wired up end to end. The settings page now offers **system / light / dark**, and the choice persists across launches.",
      "",
      "### What changed",
      "",
      "- `Appearance.tsx` renders a `SegmentedControl` bound to `useTheme()`",
      "- `ThemeProvider` resolves `system` against `prefers-color-scheme` and stores overrides in `localStorage`",
      "- Tokens in `tokens.css` gained a `[data-theme=\"dark\"]` block, so components pick the palette up for free",
      "",
      "```tsx",
      "const options = [\"system\", \"light\", \"dark\"] as const;",
      "<SegmentedControl value={theme} options={options} onChange={setTheme} />",
      "```",
      "",
      "All 12 settings tests pass. Want me to sweep the remaining hard-coded colors in `src/components` next?",
    ].join("\n"),
  );

  emit({ type: "tasks-updated", sessionId: SID, tasks: TASKS_DONE });
  emit({ type: "usage-updated", sessionId: SID, usage: { inputTokens: 48_200, outputTokens: 9_310, totalTokens: 57_510, costUSD: 0.4182, cachedInputTokens: 31_020 } });
  emit({ type: "context-updated", sessionId: SID, usedTokens: 57_510, contextWindow: 200_000 });
  emit({ type: "git-updated", sessionId: SID, git: { branch: "main", dirty: 4, ahead: 1, behind: 0, worktree: false } });
  await sleep(60);
  emit({ type: "turn-finished", sessionId: SID });
  emit({ type: "session-idle", sessionId: SID });
  emit({ type: "engine-idle", sessionId: SID, gate: "green" });
}

async function busyTurn(): Promise<void> {
  emit({ type: "user-message", sessionId: SID, text: "Refactor the billing webhook handlers to be idempotent, then prove it with the integration suite." });
  await sleep(50);
  emit({ type: "tasks-updated", sessionId: SID, tasks: TASKS_LIVE });
  emit({ type: "reasoning-delta", sessionId: SID, delta: "Stripe retries webhooks aggressively, so ingest must dedupe on event id before any side effect.\n" });
  await sleep(40);
  emit({ type: "reasoning-delta", sessionId: SID, delta: "Plan: wrap handlers in an idempotency guard keyed on event.id, back it with a unique index, replay the fixture stream twice and diff ledger rows." });
  await sleep(60);

  emit({ type: "subagent-started", sessionId: SID, subagentId: "sub_tests", prompt: "Write integration tests replaying duplicate webhook deliveries" });
  emit({ type: "subagent-activity", sessionId: SID, subagentId: "sub_tests", label: "$ vitest run billing --reporter=dot" });
  emit({ type: "subagent-started", sessionId: SID, subagentId: "sub_audit", prompt: "Audit handlers for non-idempotent side effects" });
  emit({ type: "subagent-activity", sessionId: SID, subagentId: "sub_audit", label: "read src/billing/handlers/invoice.ts" });
  await sleep(20);

  emit({ type: "orchestration-task", sessionId: SID, taskId: "dag_recon", objective: "Recon existing webhook handler structure", status: "completed", attempts: 1, durationMs: 4200 });
  emit({ type: "orchestration-task", sessionId: SID, taskId: "dag_impl", objective: "Add idempotency guard to invoice handler", status: "running" });
  emit({ type: "orchestration-task", sessionId: SID, taskId: "dag_verify", objective: "Replay fixture stream and diff ledger rows", status: "pending" });
  emit({ type: "orchestration-task", sessionId: SID, taskId: "dag_skip", objective: "Migrate legacy Stripe events (already handled)", status: "skipped" });
  emit({ type: "orchestration-task", sessionId: SID, taskId: "dag_fail", objective: "Run chaos replay with corrupted payload", status: "failed", attempts: 3, durationMs: 8100 });
  await sleep(20);

  emit({ type: "tool-call-started", sessionId: SID, toolCallId: "tc_mig", toolName: "bash", input: { command: "npm run db:migrate -- --name add-webhook-dedupe" } });
  emit({ type: "tool-call-progress", sessionId: SID, toolCallId: "tc_mig", chunk: "Applying 20260710_add_webhook_dedupe…\n" });
  await sleep(80);
  emit({ type: "tool-call-progress", sessionId: SID, toolCallId: "tc_mig", chunk: "CREATE TABLE webhook_events (id text primary key, seen_at timestamptz)\n" });

  emit({ type: "usage-updated", sessionId: SID, usage: { inputTokens: 112_400, outputTokens: 18_240, totalTokens: 130_640, costUSD: 1.0466, cachedInputTokens: 88_100 } });
  emit({ type: "context-updated", sessionId: SID, usedTokens: 130_640, contextWindow: 200_000 });
  // stays busy — no idle events
}

async function permissionTurn(): Promise<void> {
  emit({ type: "user-message", sessionId: SID, text: "Clean the build artifacts and do a strict rebuild of every workspace." });
  await sleep(60);
  emit({
    type: "permission-request",
    sessionId: SID,
    id: "perm_1",
    toolName: "bash",
    input: { command: "rm -rf dist .turbo/cache && npm run build --workspaces && node scripts/verify-dist.mjs --strict" },
  });
}

async function planTurn(): Promise<void> {
  emit({ type: "user-message", sessionId: SID, text: "Plan a migration from Express to Fastify for the API gateway." });
  await sleep(60);
  emit({
    type: "plan-presented",
    sessionId: SID,
    plan: [
      "1. Inventory the surface — 41 routes, 9 middleware chains, 3 custom error handlers.",
      "2. Introduce a Fastify app behind the same port with @fastify/express as a bridge.",
      "3. Port middleware: auth → preHandler hook, rate-limit → @fastify/rate-limit, logging → pino (native).",
      "4. Migrate routes in three slices (public, authed, admin) with parity tests per slice.",
      "5. Remove the bridge, enable schema validation on hot paths, load-test against the Express baseline.",
    ].join("\n"),
    sources: [
      { url: "https://fastify.dev/docs/latest/Guides/Migration-Guide-V5/", title: "Fastify migration guide" },
      { url: "https://github.com/fastify/fastify-express", title: "fastify-express bridge" },
      { url: "https://fastify.dev/docs/latest/Reference/Hooks/", title: "Fastify lifecycle hooks" },
    ],
    assumptions: [
      "No middleware mutates res after headers are sent",
      "Rate limits can move from per-process memory to Redis without behavior change",
    ],
    ungrounded: false,
  });
}

async function inspectorExtras(): Promise<void> {
  emit({ type: "subagent-started", sessionId: SID, subagentId: "sub_tests", prompt: "Write integration tests replaying duplicate webhook deliveries" });
  await sleep(20);
  emit({ type: "subagent-finished", sessionId: SID, subagentId: "sub_tests", result: "Added billing/replay.int.test.ts — 6 cases covering duplicate, out-of-order, and gap deliveries. All green." });
  emit({ type: "checkpoint-created", id: "cp_2", label: "after idempotency guard" });
}

/* ────────────────────────── timeline dispatch ────────────────────────── */

async function runTimeline(): Promise<void> {
  if (timelineStarted) return;
  timelineStarted = true;
  await sleep(30);

  switch (scenario) {
    case "welcome":
    case "splash":
      break;
    case "chat":
    case "light":
      await chatTurn();
      break;
    case "busy":
      await busyTurn();
      break;
    case "permission":
      await permissionTurn();
      break;
    case "plan":
      await planTurn();
      break;
    case "slash":
      await sleep(120);
      setComposerDraft("/");
      break;
    case "catalog":
      await sleep(120);
      setComposerDraft("/model");
      await sleep(600); // live-draft effect fetches models and opens the picker
      break;
    case "mention":
      await sleep(120);
      setComposerDraft("Refactor @set");
      break;
    case "jobs":
      emit({ type: "jobs-changed", sessionId: SID, jobs: JOBS });
      await sleep(120);
      setComposerDraft("/jobs");
      await sleep(80);
      pressComposerEnter();
      break;
    case "inspector":
      await chatTurn();
      await inspectorExtras();
      await sleep(80);
      document.querySelector<HTMLButtonElement>('[aria-label="Toggle session panel"]')?.click();
      break;
    default:
      await chatTurn();
  }

  await sleep(400);
  settle();
}

/* ────────────────────────── window.vibe ────────────────────────── */

if (scenario === "welcome") {
  window.localStorage.removeItem("vibe.lastCwd");
  // No project → no bootstrap/snapshot ever fires; settle on a timer instead.
  window.setTimeout(() => void runTimeline(), 300);
} else {
  window.localStorage.setItem("vibe.lastCwd", CWD);
}

const rpcHandlers: Record<string, () => unknown> = {
  snapshot: () => {
    void runTimeline();
    return baseSnapshot();
  },
  listProjects: () => PROJECTS,
  listModels: () => MODELS,
  listProviders: () => PROVIDERS,
  listAgents: () => AGENTS,
  listSkills: () => SKILLS,
  listMcp: () => MCP,
  listSessions: () => PROJECTS[0]!.sessions,
  finalize: () => null,
  renameSession: () => true,
  deleteSession: () => true,
  archiveSession: () => true,
};

const mock = {
  bootstrap: async () => ({ ok: true as const, sessionId: SID, launch: "mock" }),
  send: async () => ({ ok: true as const }),
  rpc: async (method: string) => {
    const handler = rpcHandlers[method];
    if (!handler) return { ok: false as const, error: `mock rpc: ${method} not implemented` };
    return { ok: true as const, value: handler() };
  },
  listProjects: async () => ({ ok: true as const, value: PROJECTS }),
  renameSession: async () => ({ ok: true as const }),
  deleteSession: async () => ({ ok: true as const }),
  archiveSession: async () => ({ ok: true as const }),
  stop: async () => ({ ok: true as const }),
  quit: () => undefined,
  onEvent: (cb: EventCb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  onReady: () => () => undefined,
  onFatal: () => () => undefined,
  openProject: async () => CWD,
  openExternal: async () => undefined,
  showItem: async () => undefined,
  composeInEditor: async () => ({ ok: false, reason: "no-editor" as const }),
  getPath: async () => "/Users/rob",
  listFiles: async ({ query }: { query: string }) => {
    const q = query.toLowerCase();
    return FILES.filter((f) => f.toLowerCase().includes(q)).slice(0, 8);
  },
  pasteClipboard: async () => ({ kind: "none" as const }),
  globalConfigPath: async () => "/Users/rob/.config/vibe-codr/config.json",
};

(window as unknown as { vibe: typeof mock }).vibe = mock;
(window as unknown as { __previewSettled: boolean }).__previewSettled = false;
