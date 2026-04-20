/**
 * Scope rules engine — reads scope-rules.toml and auto-assigns scopes.
 *
 * Config loading and rule evaluation are kept separate so the engine can be
 * used as a pure function in tests (pass the config directly to `resolveScopes`).
 * The `ScopeRuleEngine` class owns config loading; `resolveScopes` is the
 * pure evaluation function.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseToml } from 'smol-toml';

import { scopeStringSchema } from './scope-schema.js';

const DEFAULT_FALLBACK_SCOPE = 'personal.captures';

export interface ScopeRule {
  match: {
    source?: string;
    type?: string;
    tags?: string[];
  };
  assign: string[];
  priority: number;
}

export interface ScopeRulesConfig {
  defaults: {
    fallback_scope: string;
  };
  rules: ScopeRule[];
}

export interface ResolveInput {
  source?: string;
  type?: string;
  tags?: string[];
  /** Explicit scopes already on the engram — these always win. */
  explicitScopes?: string[];
}

function parseFallbackScope(obj: Record<string, unknown>): string {
  const fallbackRaw =
    typeof obj['defaults'] === 'object' &&
    obj['defaults'] !== null &&
    typeof (obj['defaults'] as Record<string, unknown>)['fallback_scope'] === 'string'
      ? ((obj['defaults'] as Record<string, unknown>)['fallback_scope'] as string)
      : DEFAULT_FALLBACK_SCOPE;

  const parsedFallback = scopeStringSchema.safeParse(fallbackRaw);
  if (!parsedFallback.success) {
    console.warn(
      `[cerebrum] scope-rules.toml: invalid defaults.fallback_scope '${String(fallbackRaw)}' — using default '${DEFAULT_FALLBACK_SCOPE}'`
    );
  }
  return parsedFallback.success ? parsedFallback.data : DEFAULT_FALLBACK_SCOPE;
}

function parseAssignScopes(assignRaw: unknown[]): string[] {
  const validAssign: string[] = [];
  for (const a of assignRaw) {
    const parsed = scopeStringSchema.safeParse(a);
    if (!parsed.success) {
      console.warn(
        `[cerebrum] scope-rules.toml: invalid assign scope '${String(a)}' — skipping rule scope`
      );
      continue;
    }
    validAssign.push(parsed.data);
  }
  return validAssign;
}

function parseMatchObject(matchObj: Record<string, unknown>): ScopeRule['match'] {
  const match: ScopeRule['match'] = {};
  if (typeof matchObj['source'] === 'string') match.source = matchObj['source'];
  if (typeof matchObj['type'] === 'string') match.type = matchObj['type'];
  if (Array.isArray(matchObj['tags'])) {
    match.tags = (matchObj['tags'] as unknown[]).filter((t): t is string => typeof t === 'string');
  }
  return match;
}

function parseRuleEntry(r: unknown): ScopeRule | null {
  if (typeof r !== 'object' || r === null) {
    console.warn('[cerebrum] scope-rules.toml: skipping non-object rule entry');
    return null;
  }
  const entry = r as Record<string, unknown>;
  const matchRaw = entry['match'];
  if (typeof matchRaw !== 'object' || matchRaw === null) {
    console.warn('[cerebrum] scope-rules.toml: rule missing "match" object — skipping');
    return null;
  }
  const assignRaw = entry['assign'];
  if (!Array.isArray(assignRaw)) {
    console.warn('[cerebrum] scope-rules.toml: rule missing "assign" array — skipping');
    return null;
  }
  const validAssign = parseAssignScopes(assignRaw);
  if (validAssign.length === 0) {
    console.warn('[cerebrum] scope-rules.toml: rule has no valid assign scopes — skipping');
    return null;
  }
  const priority = typeof entry['priority'] === 'number' ? entry['priority'] : 0;
  return {
    match: parseMatchObject(matchRaw as Record<string, unknown>),
    assign: validAssign,
    priority,
  };
}

/**
 * Parse and validate the raw TOML value into a `ScopeRulesConfig`.
 * Invalid rules are skipped with a console warning.
 */
function parseConfig(raw: unknown): ScopeRulesConfig {
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('scope-rules.toml must be a TOML object at the root level');
  }
  const obj = raw as Record<string, unknown>;
  const fallback_scope = parseFallbackScope(obj);
  const rawRules = Array.isArray(obj['rules']) ? (obj['rules'] as unknown[]) : [];
  const rules: ScopeRule[] = [];
  for (const r of rawRules) {
    const rule = parseRuleEntry(r);
    if (rule) rules.push(rule);
  }
  rules.sort((a, b) => b.priority - a.priority);
  return { defaults: { fallback_scope }, rules };
}

/** Returns `true` when a rule's match conditions are all satisfied by `input`. */
function ruleMatches(rule: ScopeRule, input: ResolveInput): boolean {
  if (rule.match.source !== undefined && rule.match.source !== input.source) return false;
  if (rule.match.type !== undefined && rule.match.type !== input.type) return false;
  if (rule.match.tags !== undefined && rule.match.tags.length > 0) {
    const engramTags = new Set(input.tags ?? []);
    if (!rule.match.tags.every((t) => engramTags.has(t))) return false;
  }
  return true;
}

/**
 * Pure scope resolution function.
 *
 * Priority:
 * 1. Explicit scopes (if any) — returned as-is (after deduplication)
 * 2. All matching rules contribute their scopes additively
 * 3. Fallback to `config.defaults.fallback_scope` if still empty
 */
export function resolveScopes(input: ResolveInput, config: ScopeRulesConfig): string[] {
  const explicit = input.explicitScopes ?? [];
  if (explicit.length > 0) return dedupe(explicit);

  const assigned: string[] = [];
  for (const rule of config.rules) {
    if (ruleMatches(rule, input)) {
      assigned.push(...rule.assign);
    }
  }

  if (assigned.length > 0) return dedupe(assigned);
  return [config.defaults.fallback_scope];
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Loads and caches scope-rules.toml from the engram config directory.
 * Falls back gracefully if the file is missing or malformed.
 */
export class ScopeRuleEngine {
  private readonly configPath: string;
  private cachedConfig: ScopeRulesConfig | null = null;

  constructor(engramRoot: string) {
    this.configPath = join(engramRoot, '.config', 'scope-rules.toml');
  }

  /** Infer scopes for a new engram. Delegates to `resolveScopes`. */
  inferScopes(input: ResolveInput): string[] {
    return resolveScopes(input, this.getConfig());
  }

  /** Expose the parsed config for testing. */
  getConfig(): ScopeRulesConfig {
    this.cachedConfig ??= this.loadConfig();
    return this.cachedConfig;
  }

  /** Drop the config cache (e.g. after editing the TOML file). */
  resetCache(): void {
    this.cachedConfig = null;
  }

  private loadConfig(): ScopeRulesConfig {
    let raw: string;
    try {
      raw = readFileSync(this.configPath, 'utf8');
    } catch {
      console.warn(
        `[cerebrum] scope-rules.toml not found at ${this.configPath} — using default scope`
      );
      return defaultConfig();
    }

    try {
      const parsed = parseToml(raw);
      return parseConfig(parsed);
    } catch (err) {
      console.warn(
        `[cerebrum] scope-rules.toml parse error: ${(err as Error).message} — using default scope`
      );
      return defaultConfig();
    }
  }
}

function defaultConfig(): ScopeRulesConfig {
  return {
    defaults: { fallback_scope: DEFAULT_FALLBACK_SCOPE },
    rules: [],
  };
}
