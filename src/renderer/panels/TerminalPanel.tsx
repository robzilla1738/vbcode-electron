import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";
import type { TerminalEvent } from "../../shared/terminal";
import { IconClose } from "../icons";

function themeFromTokens(): { background: string; foreground: string; cursor: string; selectionBackground: string } {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    background: token("--bg", "#111111"),
    foreground: token("--assistant", "#eeeeee"),
    cursor: token("--accent", "#eeeeee"),
    selectionBackground: token("--sel-bg", "#eeeeee"),
  };
}

function terminalFontFromTokens(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  return value || 'ui-monospace, "SF Mono", "SFMono-Regular", Menlo, Consolas, monospace';
}

export function TerminalPanel({ cwd, onClose }: { cwd: string; onClose: () => void }) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const [restartNonce, setRestartNonce] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [exit, setExit] = useState<{ code: number; signal: number } | null>(null);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;

    const terminal = new XtermTerminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorInactiveStyle: "bar",
      cursorStyle: "bar",
      cursorWidth: 1,
      fontFamily: terminalFontFromTokens(),
      fontSize: 12.5,
      lineHeight: 1.35,
      letterSpacing: 0,
      scrollback: 10_000,
      theme: themeFromTokens(),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(surface);

    let disposed = false;
    let sessionId: string | null = null;
    const pendingEvents: TerminalEvent[] = [];

    const applyEvent = (event: TerminalEvent) => {
      if (event.type === "data") {
        terminal.write(event.data);
        return;
      }
      sessionId = null;
      setExit({ code: event.exitCode, signal: event.signal });
      terminal.write(`\r\n\x1b[90m[terminal exited · code ${event.exitCode}]\x1b[0m\r\n`);
    };

    const resize = () => {
      if (disposed) return;
      fit.fit();
      if (sessionId) {
        void window.vibe.terminalResize({
          id: sessionId,
          cols: terminal.cols,
          rows: terminal.rows,
        });
      }
    };

    const unsubscribe = window.vibe.onTerminalEvent((event) => {
      if (!sessionId) {
        pendingEvents.push(event);
        return;
      }
      if (event.id === sessionId) applyEvent(event);
    });
    const dataDisposable = terminal.onData((data) => {
      if (!sessionId) return;
      void window.vibe.terminalWrite({ id: sessionId, data }).then((result) => {
        if (!result.ok && !disposed) setError(result.error);
      });
    });
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(surface);

    const open = async () => {
      setError(null);
      setExit(null);
      fit.fit();
      const result = await window.vibe.terminalOpen({
        cwd,
        cols: terminal.cols,
        rows: terminal.rows,
      });
      if (disposed) {
        if (result.ok) void window.vibe.terminalClose(result.id);
        return;
      }
      if (!result.ok) {
        setError(result.error);
        return;
      }
      sessionId = result.id;
      if (result.replay) terminal.write(result.replay);
      for (const event of pendingEvents) {
        if (event.id !== result.id) continue;
        if (event.type === "data" && event.sequence <= result.sequence) continue;
        applyEvent(event);
      }
      pendingEvents.length = 0;
      resize();
      terminal.focus();
    };
    void open();

    return () => {
      disposed = true;
      unsubscribe();
      dataDisposable.dispose();
      resizeObserver.disconnect();
      terminal.dispose();
    };
  }, [cwd, restartNonce]);

  return (
    <section className="activity-rail terminal-activity-rail" aria-labelledby="terminal-panel-title">
      <header className="sidebar-heading-row terminal-panel-header">
        <div className="sidebar-heading-copy">
          <p className="sidebar-eyebrow">Project terminal</p>
          <h2 id="terminal-panel-title" className="sidebar-heading-title">Terminal</h2>
          <p className="sidebar-heading-sub terminal-panel-subtitle" title={cwd}>{cwd}</p>
        </div>
        <div className="terminal-panel-actions">
          {exit ? (
            <button type="button" className="button terminal-restart" onClick={() => setRestartNonce((value) => value + 1)}>
              Restart
            </button>
          ) : null}
          <button type="button" className="icon-button terminal-close" onClick={onClose} aria-label="Close terminal" title="Close terminal">
            <IconClose size={14} />
          </button>
        </div>
      </header>
      <div ref={surfaceRef} className="terminal-surface" aria-label="Project terminal" />
      {error ? <p className="terminal-panel-error" role="alert">{error}</p> : null}
      {exit ? <p className="terminal-panel-status">Process exited with code {exit.code}. Restart to open a new shell.</p> : null}
    </section>
  );
}
