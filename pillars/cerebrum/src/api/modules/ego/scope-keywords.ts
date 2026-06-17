/**
 * Scope keyword/phrase constants and matching helpers for scope negotiation.
 *
 * PRD-087 US-04: Scope Negotiation.
 *
 * Reuses keyword patterns from QueryScopeInferencer (cerebrum/query) but extends
 * them for conversational phrases (e.g. "at work", "my personal stuff").
 */

// ---------------------------------------------------------------------------
// Keyword & phrase lists
// ---------------------------------------------------------------------------

/** Phrases that indicate work context. */
export const WORK_PHRASES: readonly string[] = [
  'at work',
  'for work',
  'work stuff',
  'work project',
  'work related',
  'work-related',
  'my work',
  'about work',
];

/** Individual work keywords (word-boundary matched). */
export const WORK_KEYWORDS: readonly string[] = [
  'work',
  'office',
  'meeting',
  'project',
  'client',
  'deadline',
  'sprint',
  'standup',
  'deploy',
];

/** Phrases that indicate personal context. */
export const PERSONAL_PHRASES: readonly string[] = [
  'my personal',
  'at home',
  'for personal',
  'personal stuff',
  'my personal stuff',
  'only look at personal',
  'only personal',
];

/** Individual personal keywords (word-boundary matched). */
export const PERSONAL_KEYWORDS: readonly string[] = [
  'personal',
  'journal',
  'diary',
  'therapy',
  'family',
  'health',
  'exercise',
  'hobby',
];

/** Phrases that explicitly unlock secret scopes. */
export const SECRET_UNLOCK_PHRASES: readonly string[] = [
  'include secrets',
  'include my secrets',
  'include secret notes',
  'include my secret notes',
  'include secret',
  'show secrets',
  'show my secrets',
  'unlock secrets',
];

/** Keywords that reference potentially secret content (triggers a notice). */
export const SECRET_MENTION_KEYWORDS: readonly string[] = [
  'secret',
  'password',
  'private key',
  'credential',
];

// ---------------------------------------------------------------------------
// Matching helpers
// ---------------------------------------------------------------------------

/** Test whether any phrase appears as a substring in the text (case-insensitive). */
export function matchesPhrases(text: string, phrases: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return phrases.some((phrase) => lower.includes(phrase));
}

/** Test whether any keyword appears as a standalone word (word-boundary). */
export function matchesKeywords(text: string, keywords: readonly string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(lower));
}

/** Check whether a scope path contains a "secret" segment. */
export function isSecretScope(scope: string): boolean {
  return scope.split('.').includes('secret');
}

/** Filter scopes by prefix, excluding secret scopes by default. */
export function filterByPrefix(scopes: string[], prefix: string): string[] {
  return scopes.filter((s) => s.startsWith(prefix) && !isSecretScope(s));
}

/**
 * Match a message against known scope names (leaf segment matching).
 * Only matches scopes with 3+ segments to avoid generic false positives.
 */
export function matchKnownScope(message: string, knownScopes: string[]): string | null {
  const lower = message.toLowerCase();
  let bestMatch: string | null = null;
  let bestLength = 0;

  for (const scope of knownScopes) {
    if (isSecretScope(scope)) continue;
    const segments = scope.split('.');
    if (segments.length < 3) continue;

    const leaf = segments[segments.length - 1];
    if (leaf && leaf.length >= 3 && new RegExp(`\\b${leaf}\\b`, 'i').test(lower)) {
      if (scope.length > bestLength) {
        bestMatch = scope;
        bestLength = scope.length;
      }
    }
  }
  return bestMatch;
}

/** Compare two scope arrays for equality (order-independent). */
export function scopesEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sortedA = a.toSorted();
  const sortedB = b.toSorted();
  return sortedA.every((v, i) => v === sortedB[i]);
}
