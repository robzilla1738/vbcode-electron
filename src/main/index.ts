import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, shell } from "electron";
import { join } from "node:path";
import { writeFile, mkdir } from "node:fs/promises";
import { existsSync, statSync, readdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { homedir, tmpdir } from "node:os";
import { spawn } from "node:child_process";
import liquidGlass from "electron-liquid-glass";
import type { EngineCommand } from "../shared/commands";
import type { RpcMethod } from "../shared/protocol";
import { EngineBridge } from "./engine-bridge";
import { listProjectFiles, rankPaths } from "../shared/file-fuzzy";
import { composeInEditor } from "../shared/editor-compose";

let mainWindow: BrowserWindow | null = null;
const bridge = new EngineBridge();

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

  mainWindow.on("closed", () => {
    mainWindow = null;
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
      _e,
      opts: {
        cwd: string;
        resume?: string;
        continueLatest?: boolean;
        model?: string;
        mode?: "plan" | "execute" | "yolo";
      },
    ) => {
      try {
        const sessionId = await bridge.start(opts);
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

  ipcMain.handle("engine:send", (_e, command: EngineCommand) => {
    try {
      bridge.send(command);
      return { ok: true as const };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("engine:rpc", async (_e, method: RpcMethod, params?: Record<string, unknown>) => {
    try {
      const value = await bridge.rpc(method, params);
      return { ok: true as const, value };
    } catch (err) {
      return { ok: false as const, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle("engine:stop", async () => {
    await bridge.stop();
    return { ok: true as const };
  });

  ipcMain.handle("dialog:openProject", async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ["openDirectory", "createDirectory"],
      title: "Open Project",
    });
    if (result.canceled || !result.filePaths[0]) return null;
    return result.filePaths[0];
  });

  ipcMain.handle("shell:openExternal", async (_e, url: string) => {
    const safeUrl = safeExternalUrl(url);
    if (!safeUrl) throw new Error("Unsupported external URL");
    await shell.openExternal(safeUrl);
  });

  ipcMain.handle("shell:showItem", async (_e, path: string) => {
    shell.showItemInFolder(path);
  });

  ipcMain.handle(
    "clipboard:paste",
    async (_e, opts?: { cwd?: string }) => {
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

  ipcMain.handle("editor:compose", async (_e, draft: string) => {
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

  ipcMain.handle("app:getPath", (_e, name: "home" | "userData") => app.getPath(name));
  ipcMain.on("app:quit", () => app.quit());

  ipcMain.handle(
    "fs:listFiles",
    async (_e, opts: { cwd: string; query: string; limit?: number }) => {
      const limit = opts.limit ?? 40;
      if (!existsSync(opts.cwd) || !statSync(opts.cwd).isDirectory()) return [];
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

  ipcMain.handle("config:globalPath", () => {
    const xdg = process.env.XDG_CONFIG_HOME;
    return xdg
      ? join(xdg, "vibe-codr", "config.json")
      : join(homedir(), ".config", "vibe-codr", "config.json");
  });
}

app.whenReady().then(() => {
  wireBridge();
  registerIpc();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("before-quit", async (e) => {
  if (!bridge.isRunning) return;
  e.preventDefault();
  try {
    await bridge.rpc("finalize");
  } catch {
    /* ignore */
  }
  await bridge.stop();
  app.exit(0);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
