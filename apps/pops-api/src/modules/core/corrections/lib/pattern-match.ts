import { normalizeDescription } from '../types.js';

/**
 * Verify that a proposed (pattern, matchType) actually matches the original
 * description after normalization. Mirrors the semantics of
 * `findMatchingCorrectionFromRules` so anything we accept here will match
 * the triggering transaction at apply time.
 */
export function patternMatchesDescription(
  pattern: string,
  matchType: 'exact' | 'contains' | 'regex',
  description: string
): boolean {
  const normalizedDescription = normalizeDescription(description);
  const normalizedPattern = matchType === 'regex' ? pattern : normalizeDescription(pattern);

  if (normalizedPattern.length === 0) return false;

  if (matchType === 'exact') return normalizedPattern === normalizedDescription;
  if (matchType === 'contains') return normalizedDescription.includes(normalizedPattern);

  try {
    return new RegExp(normalizedPattern).test(normalizedDescription);
  } catch {
    return false;
  }
}
