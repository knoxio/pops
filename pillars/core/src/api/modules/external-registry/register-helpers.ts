/**
 * Pure helpers for the PRD-228 register HTTP endpoint.
 *
 * Split out of `register.ts` so the handler stays focused on the
 * response shape + persistence orchestration and the body-parser can
 * be unit-tested in isolation without booting Express.
 */
import type { ValidationIssue } from '@pops/pillar-sdk';

export const PILLAR_ID_PATTERN = /^[a-z][a-z0-9-]*$/;
export const HEARTBEAT_INTERVAL_MS = 10_000;

export interface ValidRegisterBody {
  readonly pillarId: string;
  readonly baseUrl: string;
  readonly manifest: unknown;
}

export type BodyParseResult =
  | { ok: true; value: ValidRegisterBody }
  | { ok: false; issues: ValidationIssue[] };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function issue(field: string, reason: string, got: unknown): ValidationIssue {
  return { field, reason, got, schemaPath: field.length > 0 ? field.split('.') : [] };
}

function validateStringField(value: unknown, field: string, issues: ValidationIssue[]): boolean {
  if (typeof value !== 'string' || value.length === 0) {
    issues.push(issue(field, `${field} must be a non-empty string`, value));
    return false;
  }
  return true;
}

function validateBaseUrl(value: unknown, issues: ValidationIssue[]): void {
  if (!validateStringField(value, 'baseUrl', issues)) return;
  try {
    new URL(value as string);
  } catch {
    issues.push(issue('baseUrl', 'baseUrl must be a valid URL', value));
  }
}

export function parseRegisterBody(input: unknown): BodyParseResult {
  if (!isPlainObject(input)) {
    return { ok: false, issues: [issue('', 'expected an object body', input)] };
  }
  const issues: ValidationIssue[] = [];
  const { pillarId, baseUrl, manifest } = input;
  validateStringField(pillarId, 'pillarId', issues);
  validateBaseUrl(baseUrl, issues);
  if (manifest === undefined) {
    issues.push(issue('manifest', 'manifest is required', manifest));
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      pillarId: pillarId as string,
      baseUrl: baseUrl as string,
      manifest,
    },
  };
}
