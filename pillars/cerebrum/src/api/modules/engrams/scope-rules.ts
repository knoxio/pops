/**
 * Scope-rules engine for the cerebrum pillar — reads `scope-rules.toml` from
 * the engram root and auto-assigns scopes by source/type/tag matching.
 *
 * There is no settings service in the pillar, so the fallback scope is the
 * hardcoded default rather than a runtime-configurable override. Config
 * loading (`ScopeRuleEngine`) and rule evaluation (`resolveScopes`) stay
 * separate so the engine is usable as a pure function in tests.
 *
 * `ScopeRuleEngine` satisfies the `ScopeInferenceEngine` seam consumed by the
 * engram create path (`handlers/create-engram.ts`).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parse as parseToml } from 'smol-toml';

import { scopeStringSchema } from './scope-schema.js';

const HARDCODED_FALLBACK_SCOPE = 'personal.captures';

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
  const defaults = obj['defaults'];
  const fallbackRaw =
    typeof defaults === 'object' &&
    defaults !== null &&
    typeof (defaults as Record<string, unknown>)['fallback_scope'] === 'string'
      ? ((defaults as Record<string, unknown>)['fallback_scope'] as string)
      : HARDCODED_FALLBACK_SCOPE;

  const parsed = scopeStringSchema.safeParse(fallbackRaw);
  if (!parsed.success) {
    console.warn(
      `[cerebrum] scope-rules.toml: invalid defaults.fallback_scope '${fallbackRaw}' — using default '${HARDCODED_FALLBACK_SCOPE}'`
    );
  }
  return parsed.success ? parsed.data : HARDCODED_FALLBACK_SCOPE;
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
 * Parse and validate the raw TOML value into a `ScopeRulesConfig`. Invalid
 * rules are skipped with a console warning.
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

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
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
 * Pure scope resolution.
 *
 * Priority:
 * 1. Explicit scopes (if any) — returned as-is, deduplicated
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

function defaultConfig(): ScopeRulesConfig {
  return { defaults: { fallback_scope: HARDCODED_FALLBACK_SCOPE }, rules: [] };
}

/**
 * Loads and caches `scope-rules.toml` from `<engramRoot>/.config/`. Falls back
 * gracefully (default scope, no rules) when the file is missing or malformed.
 */
export class ScopeRuleEngine {
  private readonly configPath: string;
  private cachedConfig: ScopeRulesConfig | null = null;

  constructor(engramRoot: string) {
    this.configPath = join(engramRoot, '.config', 'scope-rules.toml');
  }

  /** Infer scopes for a new engram. Delegates to {@link resolveScopes}. */
  inferScopes(input: ResolveInput): string[] {
    return resolveScopes(input, this.getConfig());
  }

  /** Expose the parsed config (for the scope-inference rule tier + tests). */
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
      return parseConfig(parseToml(raw));
    } catch (err) {
      console.warn(
        `[cerebrum] scope-rules.toml parse error: ${(err as Error).message} — using default scope`
      );
      return defaultConfig();
    }
  }
}
