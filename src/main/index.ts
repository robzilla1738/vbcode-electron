import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, nativeTheme, session, shell } from "electron";
import { join, resolve, relative, isAbsolute } from "node:path";
import { writeFile, mkdir, readFile, rm } from "node:fs/promises";
import { existsSync, statSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { chatsCwdFromHome } from "../shared/project-index";
import { spawn } from "node:child_process";
import liquidGlass from "electron-liquid-glass";
import type { EngineCommand } from "../shared/commands";
import { decodeInbound, type HostInbound, type RpcMethod } from "../shared/protocol";
import { EngineBridge } from "./engine-bridge";
import { listProjectFiles, rankPaths } from "../shared/file-fuzzy";
import { composeInEditor } from "../shared/editor-compose";
import { assertTrustedIpc, assertTrustedSender, setMainWindow } from "./ipc-security";
import { registerConfigIpc } from "./config-ipc";
import { registerGitIpc } from "./git-ipc";

let mainWindow: BrowserWindow | null = null;
const bridge = new EngineBridge();

/** Unpackaged runs use Electron's default dock icon unless we set one explicitly. */
function applyDevDockIcon(): void {
  if (process.platform !== "darwin" || !app.dock || app.isPackaged) return;
  const candidates = [
    join(app.getAppPath(), "assets", "icon.png"),
    join(__dirname, "../../assets/icon.png"),
  ];
  const iconPath = candidates.find((path) => existsSync(path));
  if (!iconPath) return;
  const image = nativeImage.createFromPath(iconPath);
  if (!image.isEmpty()) app.dock.setIcon(image);
}

function inbound(value: unknown): HostInbound | null {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === "string" ? decodeInbound(encoded) : null;
  } catch {
    return null;
  }
}

function safeExternalUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function applyMacChrome(win: BrowserWindow): void {
  if (process.platform !== "darwin") return;
  win.setWindowButtonVisibility(true);
  win.webContents.once("did-finish-load", () => {
    void win.webContents.executeJavaScript(
      `document.documentElement.dataset.platform = "darwin"`,
    );
    try {
      if (!liquidGlass.isGlassSupported()) return;
      const tintColor = nativeTheme.shouldUseDarkColors ? "#0a0a0a33" : "#f5f5f528";
      const glassId = liquidGlass.addView(win.getNativeWindowHandle(), {
        cornerRadius: 12,
        tintColor,
      });
      if (glassId < 0) return;
      liquidGlass.unstable_setVariant(glassId, liquidGlass.GlassMaterialVariant.sidebar);
      void win.webContents.executeJavaScript(
        `document.documentElement.classList.add("glass","electron-transparent")`,
      );
    } catch (err) {
      console.warn("liquid glass unavailable:", err);
    }
  });
}


/**
 * In dev mode Vite injects inline scripts (React refresh preamble, HMR
 * client) that the production CSP (`script-src 'self'` in index.html) would
 * block. Relax the policy only when a dev server URL is present so the strict
 * production CSP is untouched. The override uses onHeadersReceived so it
 * applies to every dev-server response, not just the initial HTML.
 */
function configureDevCsp(): void {
  if (!process.env.ELECTRON_RENDERER_URL) return;
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self' ws: wss:",
        ],
      },
    });
  });
}


/**
 * Build the application menu — standard macOS/Windows roles plus app-specific
 * actions (Open Project, Settings, Git). Without a custom menu, Electron's
 * default lacks app-specific items and some role shortcuts (⌘W, ⌘Q) don't
 * map to the right actions.
 */
function buildApplicationMenu(): void {
  const isMac = process.platform === "darwin";
  const menu = Menu.buildFromTemplate([
    // ── App menu (macOS only — the first item gets the app name) ────────
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about" as const },
            { type: "separator" as const },
            { role: "services" as const },
            { type: "separator" as const },
            { role: "hide" as const },
            { role: "hideOthers" as const },
            { role: "unhide" as const },
            { type: "separator" as const },
            { role: "quit" as const },
          ],
        }]
      : []),
    // ── File ────────────────────────────────────────────────────────────
    {
      label: "File",
      submenu: [
        {
          label: "Open Project…",
          accelerator: "CmdOrCtrl+O",
          click: () => mainWindow?.webContents.send("menu:action", "openProject"),
        },
        {
          label: "Continue Latest Session",
          accelerator: "CmdOrCtrl+Shift+N",
          click: () => mainWindow?.webContents.send("menu:action", "continueLatest"),
        },
        { type: "separator" as const },
        { role: "close" as const },
      ],
    },
    // ── Edit (standard clipboard roles) ────────────────────────────────
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    // ── View ────────────────────────────────────────────────────────────
    {
      label: "View",
      submenu: [
        // Dev-only: reload/devtools desync engine vs renderer in packaged builds,
        // and Ctrl+Shift+I collides with Toggle Inspector on Windows/Linux.
        ...(!app.isPackaged
          ? [
              { role: "reload" as const },
              { role: "forceReload" as const },
              { role: "toggleDevTools" as const },
              { type: "separator" as const },
            ]
          : []),
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
        { type: "separator" as const },
        { role: "togglefullscreen" as const },
      ],
    },
    // ── Tools (app-specific) ────────────────────────────────────────────
    {
      label: "Tools",
      submenu: [
        {
          label: "Settings…",
          accelerator: "CmdOrCtrl+,",
          click: () => mainWindow?.webContents.send("menu:action", "toggleSettings"),
        },
        {
          label: "Git…",
          accelerator: "CmdOrCtrl+Shift+B",
          click: () => mainWindow?.webContents.send("menu:action", "toggleGit"),
        },
        {
          label: "Toggle Inspector",
          accelerator: "CmdOrCtrl+Shift+I",
          click: () => mainWindow?.webContents.send("menu:action", "toggleInspector"),
        },
      ],
    },
    // ── Window ──────────────────────────────────────────────────────────
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        ...(isMac ? [{ type: "separator" as const }, { role: "front" as const }] : []),
      ],
    },
  ]);
  Menu.setApplicationMenu(menu);
}

function createWindow(): void {
  const isMac = process.platform === "darwin";
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 820,
    minHeight: 620,
    backgroundColor: isMac ? "#00000000" : "#0a0a0a",
    transparent: isMac,
    titleBarStyle: isMac ? "hiddenInset" : "default",
    trafficLightPosition: isMac ? { x: 14, y: 12 } : undefined,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const safeUrl = safeExternalUrl(url);
    if (safeUrl) void shell.openExternal(safeUrl);
    return { action: "deny" };
  });
  mainWindow.webContents.on("will-navigate", (event, url) => {
    const current = mainWindow?.webContents.getURL();
    try {
      const nextUrl = new URL(url);
      const currentUrl = current ? new URL(current) : null;
      // In-document file navigation is used by the accessibility skip link.
      if (
        nextUrl.protocol === "file:" &&
        currentUrl?.protocol === "file:" &&
        nextUrl.pathname === currentUrl.pathname
      ) return;
    } catch {
      // Invalid navigation is denied below.
    }
    event.preventDefault();
    const safeUrl = safeExternalUrl(url);
    if (safeUrl) void shell.openExternal(safeUrl);
  });

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(join(__dirname, "../renderer/index.html"));
  }

  if (isMac) applyMacChrome(mainWindow);

  setMainWindow(mainWindow);

  mainWindow.on("closed", () => {
    mainWindow = null;
    setMainWindow(null);
  });
}

function sendToRenderer(channel: string, ...args: unknown[]): void {
  mainWindow?.webContents.send(channel, ...args);
}

function wireBridge(): void {
  bridge.onEvent = (event) => sendToRenderer("engine:event", event);
  bridge.onFatal = (message) => sendToRenderer("engine:fatal", message);
  bridge.onReady = (sessionId) => sendToRenderer("engine:ready", sessionId);
}

function registerIpc(): void {
  ipcMain.handle(
    "engine:bootstrap",
    async (
      event,
      opts: {
        cwd: string;
        resume?: string;
        continueLatest?: boolean;
        model?: string;
        mode?: "plan" | "execute" | "yolo";
      },
    ) => {
      assertTrustedIpc(event);
      // Map renderer `continueLatest` → host protocol field `continue`.
      // Spreading opts leaves `continueLatest` on the object; decodeInbound only
      // understands `continue`, so the flag was previously always dropped.
      if (!opts || typeof opts.cwd !== "string") {
        return { ok: false as const, error: "Invalid bootstrap request" };
      }
      const message = inbound({
        op: "bootstrap",
        cwd: opts.cwd,
        resume: opts.resume,
        continue: opts.continueLatest,
        model: opts.model,
        mode: opts.mode,
      });
      if (message?.op !== "bootstrap") {
        return { ok: false as const, error: "Invalid bootstrap request" };
      }
      try {
        const sessionId = await bridge.start({
          cwd: message.cwd,
          resume: message.resume,
          continueLatest: message.continue,
          model: message.model,
          mode: message.mode,
        });
        return { ok: true as const, sessionId, launch: bridge.lastLaunchDescription };
      } catch (err) {
        return {
          ok: false as const,
          error: err instanceof Error ? err.message : String(err),
          stderr: bridge.lastStderr,
          launch: bridge.lastLaunchDescription,
        };
      }
    },
  );

  ipcMain.handle("engine:send", (event, command: EngineCommand) => {
    assertTrustedIpc(event);
    const message = inbound({ op: "send", command });
    if (message?.op !== "send") return { ok: false as const, error: "Invalid engine command" };
    try {
      bridge.send(message.command);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("engine:rpc", async (event, method: RpcMethod, params?: Record<string, unknown>) => {
    assertTrustedIpc(event);
    const message = inbound({ op: "rpc", id: 1, method, ...(params ? { params } : {}) });
    if (message?.op !== "rpc") return { ok: false as const, error: "Invalid RPC request" };
    try {
      const value = await bridge.rpc(message.method, message.params);
      return { ok: true as const, value };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("engine:stop", async (event) => {
    assertTrustedIpc(event);
    await bridge.stop();
    return { ok: true as const };
  });

  ipcMain.handle("dialog:openProject", async (event) => {
    assertTrustedIpc(event);
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory", "createDirectory"],
      title: "Open Project",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("shell:openExternal", async (event, url: string) => {
    assertTrustedIpc(event);
    const safeUrl = safeExternalUrl(url);
    if (!safeUrl) throw new Error("Unsupported external URL");
    await shell.openExternal(safeUrl);
  });

  ipcMain.handle("shell:showItem", async (event, path: string) => {
    assertTrustedIpc(event);
    if (typeof path !== "string" || !path) throw new Error("Invalid item path");
    shell.showItemInFolder(path);
  });

  ipcMain.handle(
    "clipboard:paste",
    async (event, opts?: { cwd?: string }) => {
      assertTrustedIpc(event);
      if (opts !== undefined && (typeof opts !== "object" || (opts.cwd !== undefined && typeof opts.cwd !== "string"))) {
        return { kind: "error" as const, error: "Invalid clipboard request" };
      }
      try {
        const img = clipboard.readImage();
        if (!img.isEmpty()) {
          const png = img.toPNG();
          const dir = opts?.cwd
            ? join(opts.cwd, ".vibe", "clipboard")
            : join(tmpdir(), `vibe-clips-${process.pid}`);
          await mkdir(dir, { recursive: true });
          const filename = `vibe-clip-${randomUUID()}.png`;
          const abs = join(dir, filename);
          await writeFile(abs, png);
          const path = opts?.cwd ? join(".vibe", "clipboard", filename) : abs;
          return { kind: "image" as const, path };
        }
        const text = clipboard.readText();
        return text ? { kind: "text" as const, text } : { kind: "none" as const };
      } catch (error) {
        return {
          kind: "error" as const,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  );

  ipcMain.handle("editor:compose", async (event, draft: string) => {
    assertTrustedIpc(event);
    if (typeof draft !== "string") return { ok: false, reason: "failed" as const, error: "Invalid editor draft" };
    const result = await composeInEditor({
      editor: process.env.VISUAL || process.env.EDITOR,
      draft,
      spawn: (command, args) => new Promise<number>((resolve, reject) => {
        const child = spawn(command, args, { stdio: "inherit", env: process.env });
        child.once("error", reject);
        child.once("exit", (code) => resolve(code ?? 1));
      }),
    });
    if (result.kind === "replaced") return { ok: true, text: result.draft };
    if (result.kind === "failed") return { ok: false, reason: "failed", error: result.reason };
    if (result.kind === "unavailable") return { ok: false, reason: "no-editor" };
    return { ok: false, reason: "kept" };
  });

  ipcMain.handle("app:getPath", (event, name: "home" | "userData") => {
    assertTrustedIpc(event);
    if (name !== "home" && name !== "userData") throw new Error("Unsupported app path");
    return app.getPath(name);
  });

  /** One-off chats workspace (`~/.vibe/chats`) — not a code project. */
  ipcMain.handle("app:ensureChatsDir", async (event) => {
    assertTrustedIpc(event);
    const dir = chatsCwdFromHome(homedir());
    await mkdir(dir, { recursive: true });
    return dir;
  });

  ipcMain.on("app:quit", (event) => {
    assertTrustedSender(event.sender);
    app.quit();
  });

  ipcMain.handle(
    "fs:listFiles",
    async (event, opts: { cwd: string; query: string; limit?: number }) => {
      assertTrustedIpc(event);
      if (!opts || typeof opts.cwd !== "string" || typeof opts.query !== "string") return [];
      const limit = Math.min(100, Math.max(1, Number.isFinite(opts.limit) ? Math.trunc(opts.limit!) : 40));
      try {
        if (!existsSync(opts.cwd) || !statSync(opts.cwd).isDirectory()) return [];
      } catch {
        return [];
      }
      const all = listProjectFiles(opts.cwd, {
        maxFiles: 2000,
        maxDepth: 6,
        readdir: (dir) => {
          try {
            return readdirSync(dir, { withFileTypes: true }).map((d) => ({
              name: d.name,
              isDirectory: d.isDirectory(),
            }));
          } catch {
            return [];
          }
        },
      });
      return rankPaths(all, opts.query, limit);
    },
  );

  ipcMain.handle(
    "fs:readTextFile",
    async (
      event,
      opts: { cwd: string; path: string; maxBytes?: number },
    ): Promise<{ ok: true; text: string; truncated: boolean } | { ok: false; error: string }> => {
      assertTrustedIpc(event);
      if (!opts || typeof opts.cwd !== "string" || typeof opts.path !== "string") {
        return { ok: false, error: "Invalid path" };
      }
      const maxBytes = Math.min(
        256_000,
        Math.max(1024, Number.isFinite(opts.maxBytes) ? Math.trunc(opts.maxBytes!) : 65_536),
      );
      try {
        const root = resolve(opts.cwd);
        const target = resolve(root, opts.path);
        const rel = relative(root, target);
        if (rel.startsWith("..") || isAbsolute(rel)) {
          return { ok: false, error: "Path escapes the project" };
        }
        if (!existsSync(target) || !statSync(target).isFile()) {
          return { ok: false, error: "File not found" };
        }
        const buf = await readFile(target);
        const slice = buf.subarray(0, maxBytes + 1);
        // Reject obvious binaries (NUL in the first chunk).
        if (slice.includes(0)) {
          return { ok: false, error: "Binary file — reveal in Finder instead" };
        }
        const truncated = buf.length > maxBytes;
        const text = slice.subarray(0, maxBytes).toString("utf8");
        return { ok: true, text, truncated };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : "Couldn’t read file" };
      }
    },
  );

  // Config and git IPC are registered by their feature modules.
  registerConfigIpc(assertTrustedIpc);
  registerGitIpc(assertTrustedIpc);
}

app.whenReady().then(() => {
  configureDevCsp();
  buildApplicationMenu();
  applyDevDockIcon();
  wireBridge();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

let quitting = false;

app.on("before-quit", async (e) => {
  if (!bridge.isRunning) return;
  // Guard against re-entrant before-quit (e.g. Cmd+Q while already quitting,
  // or app.exit firing a second before-quit after cleanup completes).
  if (quitting) return;
  quitting = true;
  e.preventDefault();
  // Don't let a stuck host block quit — race the finalize + stop against a
  // hard 5-second budget so the app always exits promptly.
  await Promise.race([
    (async () => {
      try {
        await bridge.rpc("finalize");
      } catch {
        /* ignore */
      }
      await bridge.stop();
      // Clean up per-session clipboard temp PNGs (TUI parity: cleanupClipboardTempDir).
      // Best-effort — a cleanup failure must not trap the exit path.
      try {
        await rm(join(tmpdir(), `vibe-clips-${process.pid}`), { recursive: true, force: true });
      } catch {
        /* swallow */
      }
    })(),
    new Promise<void>((resolve) => setTimeout(resolve, 5000)),
  ]);
  app.exit(0);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
