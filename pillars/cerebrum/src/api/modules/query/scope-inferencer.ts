/**
 * QueryScopeInferencer — keyword-based scope inference for the query engine
 * (PRD-082 US-02).
 *
 * Matches question text against work/personal keyword lists to narrow retrieval
 * scopes. Falls back to all non-secret scopes when ambiguous. Lifted verbatim
 * from the monolith (pure logic, no settings/logger dependency).
 */
import type { ScopeInferenceResult } from './types.js';

const WORK_KEYWORDS = [
  'work',
  'office',
  'meeting',
  'project',
  'client',
  'deadline',
  'sprint',
  'standup',
  'pr',
  'prs',
  'deploy',
];

const PERSONAL_KEYWORDS = [
  'journal',
  'diary',
  'therapy',
  'family',
  'personal',
  'health',
  'exercise',
  'hobby',
];

const SECRET_KEYWORDS = ['secret', 'password', 'private key', 'credential'];

/**
 * Check whether a scope path contains a "secret" segment.
 * E.g. "personal.secret.keys" → true, "work.notes" → false.
 */
function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

/**
 * Test whether any keyword appears as a standalone word in the question.
 * Uses a word-boundary regex to avoid partial matches (e.g. "therapy" should
 * not match "the").
 */
function matchesKeywords(question: string, keywords: readonly string[]): boolean {
  const lower = question.toLowerCase();
  return keywords.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(lower));
}

export class QueryScopeInferencer {
  /**
   * Infer retrieval scopes from the question text.
   *
   * @param question      - The user's natural language question.
   * @param knownScopes   - All scopes available in the system (optional).
   * @param explicit      - Explicit scopes from QueryRequest (skip inference).
   * @param includeSecret - If true, allow secret scopes through.
   */
  infer(
    question: string,
    knownScopes?: string[],
    explicit?: string[],
    includeSecret?: boolean
  ): ScopeInferenceResult {
    if (explicit && explicit.length > 0) {
      const scopes = includeSecret ? explicit : explicit.filter((s) => !isSecretScope(s));
      return { scopes, source: 'explicit' };
    }

    const pool = knownScopes ?? [];

    if (matchesKeywords(question, WORK_KEYWORDS)) {
      const workScopes = pool.filter(
        (s) => s.startsWith('work.') && (includeSecret === true || !isSecretScope(s))
      );
      if (workScopes.length > 0) {
        return { scopes: workScopes, source: 'inferred' };
      }
    }

    if (matchesKeywords(question, PERSONAL_KEYWORDS)) {
      const personalScopes = pool.filter(
        (s) => s.startsWith('personal.') && (includeSecret === true || !isSecretScope(s))
      );
      if (personalScopes.length > 0) {
        return { scopes: personalScopes, source: 'inferred' };
      }
    }

    const defaultScopes = includeSecret ? pool : pool.filter((s) => !isSecretScope(s));
    return { scopes: defaultScopes, source: 'default' };
  }

  /**
   * Detect whether the question mentions secret/sensitive concepts.
   * Returns a notice string if detected, null otherwise.
   */
  detectSecretMention(question: string): string | null {
    if (matchesKeywords(question, SECRET_KEYWORDS)) {
      return 'Your question may reference sensitive data. Secret scopes are excluded unless explicitly enabled.';
    }
    return null;
  }
}
