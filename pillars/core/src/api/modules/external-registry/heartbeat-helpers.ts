/**
 * Body parser for the PRD-228 heartbeat + deregister endpoints.
 *
 * Both endpoints take the same minimal `{ pillarId }` body — the only
 * difference is what they do once the row has been resolved. The
 * shared parser lives here so neither handler grows its own copy of
 * the structured validation issues that callers consume.
 *
 * Heartbeat additionally carries an optional `capabilities` snapshot
 * (epic 05 / S3); deregister never sends it and simply ignores the field.
 */
import { parseCapabilitiesField } from './register-helpers.js';

import type { ValidationIssue } from '@pops/pillar-sdk';

import type { CapabilityStatuses } from '../../../db/index.js';

export interface ValidHeartbeatBody {
  readonly pillarId: string;
  readonly capabilities?: CapabilityStatuses;
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
  issues: ValidationIssue[]
): string | undefined {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(issue(field, `${field} must be a non-empty string`, value));
    return undefined;
  }
  return value;
}

export function parseHeartbeatBody(input: unknown): HeartbeatBodyParseResult {
  if (!isPlainObject(input)) {
    return { ok: false, issues: [issue('', 'expected an object body', input)] };
  }
  const issues: ValidationIssue[] = [];
  const pillarId = takeNonEmptyString(input.pillarId, 'pillarId', issues);
  const capabilities = parseCapabilitiesField(input.capabilities, 'capabilities', issues);
  if (pillarId === undefined || issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { pillarId, ...(capabilities === undefined ? {} : { capabilities }) } };
}
