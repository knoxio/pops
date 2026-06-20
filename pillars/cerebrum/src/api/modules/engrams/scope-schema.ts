/**
 * Scope format validation, parsing, and prefix-match utilities.
 *
 * A scope is a dot-separated hierarchical identifier (e.g. `work.projects.karbon`).
 * Scopes are normalised to lowercase before any validation so callers never need
 * to pre-normalise. All functions in this module are pure — no I/O, no DB.
 */
import { z } from 'zod';

/** Pattern for a single scope segment: lowercase alphanumeric + hyphens, 1-32 chars. */
const SCOPE_SEGMENT = /^[a-z0-9][a-z0-9-]{0,31}$/;

const MIN_DEPTH = 2;
const MAX_DEPTH = 6;

/**
 * Validate a single (already-lowercased) scope string.
 * Returns an array of error messages — empty means valid.
 */
function validateNormalised(scope: string): string[] {
  const errors: string[] = [];

  if (scope.length === 0) {
    errors.push('scope must not be empty');
    return errors;
  }
  if (scope.startsWith('.') || scope.endsWith('.')) {
    errors.push('scope must not start or end with a dot');
  }
  if (scope.includes('..')) {
    errors.push('scope must not contain consecutive dots');
  }

  const segments = scope.split('.');
  if (segments.length < MIN_DEPTH) {
    errors.push(`scope must have at least ${MIN_DEPTH} segments (got ${segments.length})`);
  }
  if (segments.length > MAX_DEPTH) {
    errors.push(`scope must have at most ${MAX_DEPTH} segments (got ${segments.length})`);
  }

  for (const seg of segments) {
    if (seg.length === 0) continue; // already caught by consecutive-dot check
    if (!SCOPE_SEGMENT.test(seg)) {
      errors.push(
        `segment '${seg}' is invalid — must be lowercase alphanumeric/hyphens, 1-32 chars`
      );
    }
  }

  return errors;
}

/** Zod schema for a normalised scope string. Normalises before validating. */
export const scopeStringSchema = z
  .string()
  .transform((val) => normaliseScope(val))
  .superRefine((val, ctx) => {
    for (const err of validateNormalised(val)) {
      ctx.addIssue({ code: 'custom', message: err });
    }
  });

/** Zod schema for an array of scope strings (normalises each element). */
export const scopeArraySchema = z.array(scopeStringSchema).min(1, 'at least one scope is required');

export interface Scope {
  /** Original normalised string, e.g. `work.projects.karbon`. */
  raw: string;
  /** Individual segments. */
  segments: string[];
  /** Number of segments. */
  depth: number;
  /** First segment. */
  topLevel: string;
  /** True when any segment equals `secret`. */
  isSecret: boolean;
}

/**
 * Lowercase and trim a scope string.
 * Call this before any other operation when accepting user input.
 */
export function normaliseScope(scope: string): string {
  return scope.trim().toLowerCase();
}

/**
 * Split a normalised scope string into a typed `Scope` object.
 * Does NOT validate — callers should validate with `scopeStringSchema` first
 * or be working with known-good values.
 */
export function parseScope(scope: string): Scope {
  const segments = scope.split('.');
  return {
    raw: scope,
    segments,
    depth: segments.length,
    topLevel: segments[0] ?? '',
    isSecret: segments.includes('secret'),
  };
}

/**
 * Return `true` when `scope` matches the given `prefix` at a segment boundary.
 *
 * @example
 * matchesPrefix("work.projects.karbon", "work")          // true
 * matchesPrefix("work.projects.karbon", "work.projects") // true
 * matchesPrefix("work.projects.karbon", "personal")      // false
 */
export function matchesPrefix(scope: string, prefix: string): boolean {
  if (scope === prefix) return true;
  return scope.startsWith(`${prefix}.`);
}

/**
 * Return `true` when the scope contains `.secret.` as a segment (i.e. any
 * segment named exactly `secret`).
 */
export function isSecretScope(scope: string): boolean {
  return parseScope(scope).isSecret;
}

/**
 * Validate a scope string and return structured result.
 * Normalises before validating so callers get the normalised form on success.
 */
export function validateScope(
  raw: string
): { valid: true; scope: string } | { valid: false; errors: string[] } {
  const normalised = normaliseScope(raw);
  const errors = validateNormalised(normalised);
  if (errors.length === 0) return { valid: true, scope: normalised };
  return { valid: false, errors };
}
