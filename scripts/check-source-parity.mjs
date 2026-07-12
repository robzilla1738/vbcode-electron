#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";

const electronRoot = resolve(import.meta.dirname, "..");
const vibeRoot = process.env.VIBE_CODR_ROOT || join(homedir(), "Code", "vibe-codr");

// Files where the Electron app intentionally diverges from the upstream TUI.
// `extras` allows declarations not in upstream; `drift` allows modified
// versions of upstream declarations. Both are documented in PARITY.md.
const ALLOW_EXTRAS = new Set([
  "modes",       // selectModeAction for the mode dropdown
  "reducer",     // isMarkdown flag on tool blocks for spawn_subagent/spawn_tasks
  "density",     // isMarkdown check in toolCollapsed for verbose expansion
  "tool-icons",  // permissionKind/permissionDetail/permissionPreview for the GUI card
  "themes",      // Electron-specific palette values (Graphite default differs)
  "protocol",    // encodeInbound helper not in the macos-bridge host
]);

const pairs = [
  ["packages/shared/src/commands.ts", "src/shared/commands.ts", { extras: true }],
  ["packages/shared/src/events.ts", "src/shared/events.ts", { extras: true }],
  ["packages/shared/src/types.ts", "src/shared/types.ts", { extras: true }],
  ["packages/macos-bridge/src/protocol.ts", "src/shared/protocol.ts", { extras: true, drift: true }],
  ...[
    "slash",
    "reducer",
    "modes",
    "density",
    "file-fuzzy",
    "markdown-blocks",
    "rich-blocks",
    "tool-icons",
    "chrome-seed",
    "spinner",
    "trail",
    "editor-compose",
    "themes",
    "glyphs",
    "wordmark",
  ].map((name) => [
    `packages/tui/src/${name}.ts`,
    `src/shared/${name}.ts`,
    { extras: ALLOW_EXTRAS.has(name), drift: ALLOW_EXTRAS.has(name) },
  ]),
];

function declarationName(node) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;
  if (ts.isVariableStatement(node)) {
    return node.declarationList.declarations
      .map((declaration) => ts.isIdentifier(declaration.name) ? declaration.name.text : "")
      .filter(Boolean)
      .join(",");
  }
  return null;
}

function declarations(path) {
  const source = ts.createSourceFile(
    path,
    readFileSync(path, "utf8"),
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });
  const out = new Map();
  for (const node of source.statements) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) continue;
    const name = declarationName(node);
    if (!name) continue;
    // SourceFile is supplied explicitly so printing is stable across the two paths.
    out.set(`${ts.SyntaxKind[node.kind]}:${name}`, printer.printNode(ts.EmitHint.Unspecified, node, source));
  }
  return out;
}

const failures = [];
for (const [upstreamRel, electronRel, allowElectronExtras] of pairs) {
  const upstreamPath = join(vibeRoot, upstreamRel);
  const electronPath = join(electronRoot, electronRel);
  if (!existsSync(upstreamPath)) {
    failures.push(`${upstreamRel}: upstream file missing (set VIBE_CODR_ROOT)`);
    continue;
  }
  if (!existsSync(electronPath)) {
    failures.push(`${electronRel}: Electron port missing`);
    continue;
  }
  const upstream = declarations(upstreamPath);
  const electron = declarations(electronPath);
  const allowExtras = typeof allowElectronExtras === "object" ? allowElectronExtras.extras : allowElectronExtras;
  const allowDrift = typeof allowElectronExtras === "object" ? allowElectronExtras.drift : false;
  // Normalize whitespace so formatting-only differences (line wrapping, spacing)
  // don't cause false drift. The TS printer preserves original newlines in
  // array/object literals, so a single-line vs multi-line array would drift
  // even when semantically identical. Collapsing whitespace before comparison
  // catches real code changes while ignoring pure formatting.
  const norm = (s) => s.replace(/\s+/g, " ").trim();
  for (const [key, value] of upstream) {
    if (!electron.has(key)) failures.push(`${electronRel}: missing upstream declaration ${key}`);
    else if (!allowDrift && norm(electron.get(key)) !== norm(value)) failures.push(`${electronRel}: drifted declaration ${key}`);
  }
  if (!allowExtras) {
    for (const key of electron.keys()) {
      if (!upstream.has(key)) failures.push(`${electronRel}: unexpected declaration ${key}`);
    }
  }
}

if (failures.length) {
  console.error("CLI source parity check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`CLI source parity OK (${pairs.length} source pairs)`);
