import { randomUUID } from "node:crypto";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type EditorSpawn = (command: string, args: string[]) => Promise<number>;

export type EditorComposeResult =
  | { kind: "replaced"; draft: string }
  | { kind: "kept" }
  | { kind: "unavailable" }
  | { kind: "failed"; reason: string };

export interface EditorComposeDeps {
  editor: string | undefined;
  draft: string;
  spawn: EditorSpawn;
  outPath?: string;
  readText?: (path: string) => Promise<string>;
  writeText?: (path: string, text: string) => Promise<void>;
  removeFile?: (path: string) => Promise<void>;
}

export function parseEditorCommand(editor: string): { command: string; args: string[] } {
  const parts = editor.trim().split(/\s+/).filter(Boolean);
  return { command: parts[0] ?? "", args: parts.slice(1) };
}

export async function composeInEditor(deps: EditorComposeDeps): Promise<EditorComposeResult> {
  if (!deps.editor?.trim()) return { kind: "unavailable" };
  const { command, args } = parseEditorCommand(deps.editor);
  if (!command) return { kind: "unavailable" };

  const path = deps.outPath ?? join(tmpdir(), `vibe-compose-${randomUUID()}.md`);
  const write = deps.writeText ?? ((p, t) => writeFile(p, t, "utf8"));
  const read = deps.readText ?? ((p) => readFile(p, "utf8"));
  const remove = deps.removeFile ?? ((p) => rm(p, { force: true }));

  try {
    await write(path, deps.draft);
  } catch (err) {
    return { kind: "failed", reason: (err as Error).message };
  }
  let exitCode = 0;
  try {
    exitCode = await deps.spawn(command, [...args, path]);
  } catch (err) {
    await remove(path).catch(() => {});
    return { kind: "failed", reason: (err as Error).message };
  }

  if (exitCode !== 0) {
    await remove(path).catch(() => {});
    return { kind: "kept" };
  }

  let contents: string;
  try {
    contents = await read(path);
  } catch (err) {
    return { kind: "failed", reason: (err as Error).message };
  } finally {
    await remove(path).catch(() => {});
  }

  const next = contents.replace(/\n$/, "");
  if (!next.trim()) return { kind: "kept" };
  return { kind: "replaced", draft: next };
}
