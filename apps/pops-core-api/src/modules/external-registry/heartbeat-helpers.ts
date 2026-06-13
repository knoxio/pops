/**
 * Body parser for the PRD-228 heartbeat + deregister endpoints.
 *
 * Both endpoints take the same minimal `{ pillarId, apiKey }` body —
 * the only difference is what they do once the caller is authorised.
 * The shared parser lives here so neither handler grows its own copy
 * of the structured validation issues that callers consume.
 */
import type { ValidationIssue } from '@pops/pillar-sdk';

export interface ValidHeartbeatBody {
  readonly pillarId: string;
  readonly apiKey: string;
}

export type HeartbeatBodyParseResult =
  | { ok: true; value: ValidHeartbeatBody }
  | { ok: false; issues: ValidationIssue[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(field: string, reason: string, got: unknown): ValidationIssue {
  return { field, reason, got, schemaPath: field.length > 0 ? field.split('.') : [] };
}

function takeNonEmptyString(
  value: unknown,
  field: string,
  redact: boolean,
  issues: ValidationIssue[]
): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    const got = redact && typeof value === 'string' ? '<redacted>' : value;
    issues.push(issue(field, `${field} must be a non-empty string`, got));
    return undefined;
  }
  return value;
}

export function parseHeartbeatBody(input: unknown): HeartbeatBodyParseResult {
  if (!isPlainObject(input)) {
    return { ok: false, issues: [issue('', 'expected an object body', input)] };
  }
  const issues: ValidationIssue[] = [];
  const pillarId = takeNonEmptyString(input.pillarId, 'pillarId', false, issues);
  const apiKey = takeNonEmptyString(input.apiKey, 'apiKey', true, issues);
  if (pillarId === undefined || apiKey === undefined) return { ok: false, issues };
  return { ok: true, value: { pillarId, apiKey } };
}
