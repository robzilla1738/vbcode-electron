/**
 * Lightweight pre-write config validation — catches the most common
 * "bricking" scenarios (invalid URLs, out-of-range numbers, bad enum values)
 * so an invalid patch is rejected BEFORE it's persisted, mirroring the
 * engine's `ConfigSchema.safeParse` gate in `@vibe/config`.
 *
 * This is NOT a full schema validation (the engine does that on load); it's a
 * targeted guard against values that would make the config un-loadable. The
 * engine's Zod schema is the authority — this is a best-effort pre-flight check
 * so the Electron shell can surface a helpful error instead of silently writing
 * a config the engine will reject on the next bootstrap.
 */

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function httpUrlWithHost(value: unknown): true | string {
  if (typeof value !== "string" || !value) return true; // empty = unset
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      return "must be an http(s) URL (e.g. https://host:port/path)";
    }
    if (!u.host) return "must include a host (e.g. https://host:port/path)";
    return true;
  } catch {
    return "must be a valid http(s) URL";
  }
}

/** Expandable URL — allows `${VAR}` references (MCP url field). */
function expandableHttpUrl(value: unknown): true | string {
  if (typeof value !== "string" || !value) return true;
  if (value.includes("${")) return true; // env-var reference, validated post-expansion
  return httpUrlWithHost(value);
}

function checkNumber(
  value: unknown,
  opts: { min?: number; max?: number; integer?: boolean },
  path: string,
): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return [`${path}: must be a finite number`];
  }
  const errs: string[] = [];
  if (opts.integer && !Number.isInteger(value)) errs.push(`${path}: must be an integer`);
  if (opts.min !== undefined && value < opts.min) errs.push(`${path}: must be ≥ ${opts.min}`);
  if (opts.max !== undefined && value > opts.max) errs.push(`${path}: must be ≤ ${opts.max}`);
  return errs;
}

const ENUM_VALUES: Record<string, readonly string[]> = {
  mode: ["plan", "execute"],
  approvalMode: ["ask", "auto"],
  details: ["quiet", "normal", "verbose"],
  "sandbox.mode": ["off", "read-only", "workspace-write"],
  "sandbox.network": ["on", "off"],
  "build.commit.mode": ["checkpoint", "branch", "off"],
  "reasoning.effort": ["low", "medium", "high"],
  "budget.onExceed": ["warn", "stop"],
};

function checkEnum(value: unknown, allowed: readonly string[], path: string): string[] {
  if (value === undefined || value === null) return [];
  if (typeof value !== "string" || !allowed.includes(value)) {
    return [`${path}: must be one of ${allowed.join(", ")}`];
  }
  return [];
}

/**
 * Validate a merged config object for the most critical constraints.
 * Returns an array of error messages (empty = valid).
 */
export function validateConfig(config: Record<string, unknown>): string[] {
  const errors: string[] = [];

  // Provider baseURLs
  if (isPlainObject(config.providers)) {
    for (const [id, prov] of Object.entries(config.providers)) {
      if (!isPlainObject(prov)) continue;
      const urlCheck = httpUrlWithHost(prov.baseURL);
      if (urlCheck !== true) errors.push(`providers.${id}.baseURL: ${urlCheck}`);
    }
  }

  // MCP servers: remote URL shape + stdio command required when enabled
  if (isPlainObject(config.mcp) && isPlainObject(config.mcp.servers)) {
    for (const [name, server] of Object.entries(config.mcp.servers as Record<string, unknown>)) {
      if (!isPlainObject(server)) continue;
      if ("url" in server) {
        if (server.enabled !== false) {
          const url = typeof server.url === "string" ? server.url.trim() : "";
          if (!url) {
            errors.push(`mcp.servers.${name}.url: required for enabled remote servers`);
          } else {
            const urlCheck = expandableHttpUrl(url);
            if (urlCheck !== true) errors.push(`mcp.servers.${name}.url: ${urlCheck}`);
          }
        } else {
          const urlCheck = expandableHttpUrl(server.url);
          if (urlCheck !== true) errors.push(`mcp.servers.${name}.url: ${urlCheck}`);
        }
      } else if (server.enabled !== false) {
        const cmd = typeof server.command === "string" ? server.command.trim() : "";
        if (!cmd) {
          errors.push(`mcp.servers.${name}.command: required for enabled stdio servers`);
        }
      }
    }
  }

  // Hooks: command or url required; url must be http(s)
  if (Array.isArray(config.hooks)) {
    config.hooks.forEach((hook, i) => {
      if (!isPlainObject(hook)) return;
      const cmd = typeof hook.command === "string" ? hook.command.trim() : "";
      const url = hook.url;
      if (!cmd && !url) {
        errors.push(`hooks[${i}]: requires either command or url`);
      }
      if (url) {
        const urlCheck = httpUrlWithHost(url);
        if (urlCheck !== true) errors.push(`hooks[${i}].url: ${urlCheck}`);
      }
    });
  }

  // Numeric ranges (the most critical — an inverted or negative value here
  // would be rejected by the engine schema on load)
  if (isPlainObject(config.subagent)) {
    const sa = config.subagent;
    errors.push(...checkNumber(sa.maxDepth, { min: 1, integer: true }, "subagent.maxDepth"));
    errors.push(...checkNumber(sa.maxParallel, { min: 1, integer: true }, "subagent.maxParallel"));
    errors.push(...checkNumber(sa.maxTotal, { min: 1, integer: true }, "subagent.maxTotal"));
    errors.push(...checkNumber(sa.timeoutMs, { min: 0, integer: true }, "subagent.timeoutMs"));
    errors.push(...checkNumber(sa.verifyMaxAttempts, { min: 1, max: 5, integer: true }, "subagent.verifyMaxAttempts"));
    errors.push(...checkNumber(sa.structuredMaxAttempts, { min: 1, integer: true }, "subagent.structuredMaxAttempts"));
  }
  if (isPlainObject(config.compaction)) {
    const c = config.compaction;
    errors.push(...checkNumber(c.threshold, { min: 0.1, max: 0.95 }, "compaction.threshold"));
    if (isPlainObject(c.offload)) {
      errors.push(...checkNumber(c.offload.threshold, { min: 0.1, max: 0.9 }, "compaction.offload.threshold"));
      errors.push(...checkNumber(c.offload.maxResultBytes, { min: 1, integer: true }, "compaction.offload.maxResultBytes"));
      errors.push(...checkNumber(c.offload.previewBytes, { min: 1, integer: true }, "compaction.offload.previewBytes"));
      errors.push(...checkNumber(c.offload.keepLiveResults, { min: 0, integer: true }, "compaction.offload.keepLiveResults"));
      errors.push(...checkNumber(c.offload.maxArtifactBytes, { min: 1, integer: true }, "compaction.offload.maxArtifactBytes"));
    }
  }
  errors.push(...checkNumber(config.maxSteps, { min: 1, integer: true }, "maxSteps"));
  errors.push(...checkNumber(config.streamIdleTimeoutMs, { min: 0, integer: true }, "streamIdleTimeoutMs"));

  // Enum fields
  errors.push(...checkEnum(config.mode, ENUM_VALUES.mode!, "mode"));
  errors.push(...checkEnum(config.approvalMode, ENUM_VALUES.approvalMode!, "approvalMode"));
  errors.push(...checkEnum(config.details, ENUM_VALUES.details!, "details"));
  if (isPlainObject(config.sandbox)) {
    errors.push(...checkEnum(config.sandbox.mode, ENUM_VALUES["sandbox.mode"]!, "sandbox.mode"));
    errors.push(...checkEnum(config.sandbox.network, ENUM_VALUES["sandbox.network"]!, "sandbox.network"));
  }
  if (isPlainObject(config.reasoning)) {
    errors.push(...checkEnum(config.reasoning.effort, ENUM_VALUES["reasoning.effort"]!, "reasoning.effort"));
  }
  if (isPlainObject(config.budget)) {
    errors.push(...checkEnum(config.budget.onExceed, ENUM_VALUES["budget.onExceed"]!, "budget.onExceed"));
    errors.push(...checkNumber(config.budget.limitUSD, { min: 0 }, "budget.limitUSD"));
  }
  if (isPlainObject(config.retry)) {
    errors.push(...checkNumber(config.retry.maxAttempts, { min: 0, max: 20, integer: true }, "retry.maxAttempts"));
    errors.push(...checkNumber(config.retry.baseDelayMs, { min: 0, integer: true }, "retry.baseDelayMs"));
  }
  if (isPlainObject(config.goal)) {
    errors.push(...checkNumber(config.goal.maxRounds, { min: 0, integer: true }, "goal.maxRounds"));
  }
  if (isPlainObject(config.loop)) {
    errors.push(...checkNumber(config.loop.maxIterations, { min: 0, integer: true }, "loop.maxIterations"));
  }
  if (isPlainObject(config.reasoning)) {
    errors.push(...checkNumber(config.reasoning.budgetTokens, { min: 0, integer: true }, "reasoning.budgetTokens"));
  }
  // Permissions actions (Settings surface)
  if (Array.isArray(config.permissions)) {
    const validActions = new Set(["allow", "deny", "ask"]);
    config.permissions.forEach((rule, i) => {
      if (!isPlainObject(rule)) return;
      if (rule.action !== undefined && (typeof rule.action !== "string" || !validActions.has(rule.action))) {
        errors.push(`permissions[${i}].action: must be one of allow, deny, ask`);
      }
    });
  }
  if (isPlainObject(config.build)) {
    if (isPlainObject(config.build.commit)) {
      errors.push(...checkEnum(config.build.commit.mode, ENUM_VALUES["build.commit.mode"]!, "build.commit.mode"));
    }
    if (isPlainObject(config.build.gate)) {
      errors.push(...checkNumber(config.build.gate.maxRounds, { min: 0, max: 20, integer: true }, "build.gate.maxRounds"));
      errors.push(...checkNumber(config.build.gate.timeoutSec, { min: 1, integer: true }, "build.gate.timeoutSec"));
      if (Array.isArray(config.build.gate.checks)) {
        const validChecks = ["build", "typecheck", "test", "lint"];
        for (const check of config.build.gate.checks) {
          if (typeof check !== "string" || !validChecks.includes(check)) {
            errors.push(`build.gate.checks: invalid check "${check}"`);
          }
        }
      }
    }
    if (isPlainObject(config.build.review)) {
      errors.push(...checkNumber(config.build.review.maxRounds, { min: 0, max: 10, integer: true }, "build.review.maxRounds"));
    }
  }
  // Expandable MCP URLs with ${ must use valid ${ENV_VAR} placeholders
  if (isPlainObject(config.mcp) && isPlainObject(config.mcp.servers)) {
    for (const [name, server] of Object.entries(config.mcp.servers as Record<string, unknown>)) {
      if (!isPlainObject(server) || typeof server.url !== "string") continue;
      if (!server.url.includes("${")) continue;
      if (!/\$\{[A-Za-z_][A-Za-z0-9_]*\}/.test(server.url)) {
        errors.push(`mcp.servers.${name}.url: invalid env placeholder`);
      }
    }
  }

  return errors;
}
