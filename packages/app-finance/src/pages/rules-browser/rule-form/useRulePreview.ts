import { usePillarQuery } from '@pops/pillar-sdk/react';
import { useDebouncedValue } from '@pops/ui';

import type { MatchType } from '../types';
import type { RulePreviewResult } from './types';

interface PreviewMatchesOutput {
  data: RulePreviewResult;
}

interface UseRulePreviewArgs {
  pattern: string;
  matchType: MatchType;
  /**
   * When true, the preview query is paused (useful while the dialog
   * is closed). The query also pauses automatically when the pattern
   * is empty.
   */
  enabled: boolean;
}

function isMatchType(value: string): value is MatchType {
  return value === 'exact' || value === 'contains' || value === 'regex';
}

function asMatchType(value: string, fallback: MatchType): MatchType {
  return isMatchType(value) ? value : fallback;
}

interface UseRulePreviewResult {
  /** Latest debounced preview, or `undefined` while we're still loading. */
  data: RulePreviewResult | undefined;
  isFetching: boolean;
  error: { message: string } | null;
  /** Forces an immediate refetch — surfaces a "Run preview" button. */
  refetch: () => Promise<unknown>;
  /** Mirrors the input pattern so callers can show the active query. */
  inputPattern: string;
  /** Mirrors the input matchType so callers can render context. */
  inputMatchType: MatchType;
  /** True before the user has typed anything (avoid showing zero-state). */
  isIdle: boolean;
}

/**
 * Live preview hook backing the manual rule create/edit dialog (#2187).
 *
 * Behaviour:
 *   - Debounces the (pattern, matchType) tuple by 300ms so per-keystroke
 *     network calls stay quiet.
 *   - Disabled while `enabled` is false OR the pattern is empty.
 *   - Returns the matched transactions (capped at 25 by the API), the
 *     full match count, and a truncated flag for UI signalling.
 */
export function useRulePreview({
  pattern,
  matchType,
  enabled,
}: UseRulePreviewArgs): UseRulePreviewResult {
  const debouncedPattern = useDebouncedValue(pattern, 300);
  const debouncedMatchTypeRaw = useDebouncedValue(matchType, 300);
  const debouncedMatchType = asMatchType(debouncedMatchTypeRaw, matchType);
  const trimmed = debouncedPattern.trim();
  const isIdle = trimmed.length === 0;

  const query = usePillarQuery<PreviewMatchesOutput>(
    'core',
    ['corrections', 'previewMatches'],
    { descriptionPattern: trimmed, matchType: debouncedMatchType },
    {
      enabled: enabled && !isIdle,
      staleTime: 5_000,
    }
  );

  return {
    data: query.data?.data,
    isFetching: query.isFetching,
    error: query.error ? { message: query.error.message } : null,
    refetch: () => query.refetch(),
    inputPattern: trimmed,
    inputMatchType: debouncedMatchType,
    isIdle,
  };
}
