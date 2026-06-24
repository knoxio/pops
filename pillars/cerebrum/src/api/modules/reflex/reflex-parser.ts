/**
 * Reflex TOML parser and validator (spec: reflex-system).
 *
 * Parses `reflexes.toml` into validated `ReflexDefinition[]`. Invalid
 * individual reflexes are skipped (with warnings); a TOML syntax error
 * disables the entire file.
 */
import { parse as parseToml } from 'smol-toml';

import { validateAction, validateTrigger } from './reflex-validators.js';

import type { ReflexDefinition } from './types.js';

export interface ParseResult {
  reflexes: ReflexDefinition[];
  errors: ParseError[];
}

export interface ParseError {
  reflexName: string | null;
  message: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parse raw TOML text into validated reflex definitions.
 *
 * - TOML syntax errors -> zero reflexes + one error entry.
 * - Per-reflex validation errors -> that reflex skipped, others kept.
 * - Template variable warnings are surfaced as errors (non-fatal: reflex loads).
 */
export function parseReflexesToml(tomlText: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = parseToml(tomlText);
  } catch (err) {
    return {
      reflexes: [],
      errors: [{ reflexName: null, message: `TOML parse error: ${(err as Error).message}` }],
    };
  }

  if (!isRecord(parsed)) return { reflexes: [], errors: [] };

  const rawReflexes = parsed['reflex'];
  if (!Array.isArray(rawReflexes)) {
    return { reflexes: [], errors: [] };
  }

  const reflexes: ReflexDefinition[] = [];
  const errors: ParseError[] = [];
  const seenNames = new Set<string>();

  for (const raw of rawReflexes) {
    const result = validateReflex(raw, seenNames);
    if (result.error) errors.push(result.error);
    if (result.warnings) errors.push(...result.warnings);
    if (result.reflex) {
      reflexes.push(result.reflex);
      seenNames.add(result.reflex.name);
    }
  }

  return { reflexes, errors };
}

interface ValidateResult {
  reflex: ReflexDefinition | null;
  error: ParseError | null;
  warnings: ParseError[] | null;
}

function fail(reflexName: string | null, message: string): ValidateResult {
  return { reflex: null, error: { reflexName, message }, warnings: null };
}

function validateReflexFields(
  entry: Record<string, unknown>,
  seenNames: Set<string>
): { name: string; description: string; enabled: boolean } | ParseError {
  const name = entry['name'];
  if (typeof name !== 'string' || name.length === 0) {
    return { reflexName: null, message: 'Reflex missing required "name" field' };
  }
  if (seenNames.has(name)) {
    return { reflexName: name, message: `Duplicate reflex name: "${name}"` };
  }
  const description = entry['description'];
  if (typeof description !== 'string' || description.length === 0) {
    return { reflexName: name, message: `Reflex "${name}": missing required "description" field` };
  }
  const enabled = entry['enabled'];
  if (typeof enabled !== 'boolean') {
    return { reflexName: name, message: `Reflex "${name}": "enabled" must be a boolean` };
  }
  return { name, description, enabled };
}

function checkTemplateWarnings(
  name: string,
  trigger: { type: string },
  action: { target?: string; template?: string }
): ParseError[] {
  if (trigger.type === 'event') return [];
  const combined = `${action.target ?? ''} ${action.template ?? ''}`;
  if (/\{\{[^}]+\}\}/.test(combined)) {
    return [
      {
        reflexName: name,
        message: `Reflex "${name}": template variables (e.g. {{engram_id}}) are only valid for event triggers — variables will resolve to empty strings`,
      },
    ];
  }
  return [];
}

function validateReflex(raw: unknown, seenNames: Set<string>): ValidateResult {
  if (!isRecord(raw)) {
    return fail(null, 'Reflex entry is not an object');
  }

  const fields = validateReflexFields(raw, seenNames);
  if ('reflexName' in fields) return fail(fields.reflexName, fields.message);

  const { name, description, enabled } = fields;

  const triggerResult = validateTrigger(raw['trigger'], name);
  if (triggerResult.error) return { reflex: null, error: triggerResult.error, warnings: null };

  const actionResult = validateAction(raw['action'], name);
  if (actionResult.error) return { reflex: null, error: actionResult.error, warnings: null };

  const trigger = triggerResult.trigger;
  const action = actionResult.action;
  if (!trigger || !action) return fail(name, `Reflex "${name}": internal validation error`);

  const warnings = checkTemplateWarnings(name, trigger, action);

  return {
    reflex: { name, description, enabled, trigger, action },
    error: null,
    warnings: warnings.length > 0 ? warnings : null,
  };
}
