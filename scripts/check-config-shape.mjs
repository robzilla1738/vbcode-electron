#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import ts from "typescript";

const electronRoot = resolve(import.meta.dirname, "..");
const vibeRoot = process.env.VIBE_CODR_ROOT || join(homedir(), "Code", "vibe-codr");
const upstreamPath = join(vibeRoot, "packages/config/src/schema.ts");
const localPath = join(electronRoot, "src/shared/config-schema.ts");

for (const path of [upstreamPath, localPath]) {
  if (!existsSync(path)) {
    console.error(`Config shape check failed: ${path} does not exist`);
    process.exit(1);
  }
}

function sourceFile(path) {
  return ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
}

function propertyName(node) {
  const name = node.name;
  if (!name) return null;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
  return null;
}

function upstreamKeys(path) {
  const source = sourceFile(path);
  let objectLiteral;
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (!ts.isIdentifier(declaration.name) || declaration.name.text !== "ConfigSchema") continue;
      const initializer = declaration.initializer;
      if (!initializer || !ts.isCallExpression(initializer) || initializer.arguments.length === 0) continue;
      const candidate = initializer.arguments[0];
      if (ts.isObjectLiteralExpression(candidate)) objectLiteral = candidate;
    }
  }
  if (!objectLiteral) throw new Error(`Could not find ConfigSchema z.object literal in ${path}`);
  return new Set(objectLiteral.properties.map(propertyName).filter(Boolean));
}

function localKeys(path) {
  const source = sourceFile(path);
  const declaration = source.statements.find(
    (statement) => ts.isInterfaceDeclaration(statement) && statement.name.text === "VibeConfig",
  );
  if (!declaration || !ts.isInterfaceDeclaration(declaration)) {
    throw new Error(`Could not find VibeConfig interface in ${path}`);
  }
  return new Set(declaration.members.map(propertyName).filter(Boolean));
}

try {
  const upstream = upstreamKeys(upstreamPath);
  const local = localKeys(localPath);
  const missing = [...upstream].filter((key) => !local.has(key)).sort();
  const extra = [...local].filter((key) => !upstream.has(key)).sort();
  if (missing.length || extra.length) {
    console.error("Config shape check failed:");
    if (missing.length) console.error(`- missing engine fields: ${missing.join(", ")}`);
    if (extra.length) console.error(`- fields absent from engine: ${extra.join(", ")}`);
    process.exit(1);
  }
  console.log(`Config shape parity OK (${upstream.size} top-level fields)`);
} catch (error) {
  console.error(`Config shape check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
