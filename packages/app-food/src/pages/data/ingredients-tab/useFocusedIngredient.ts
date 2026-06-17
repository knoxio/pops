/**
 * Deep-link plumbing for `/food/data/ingredients?focus=<slug>`.
 *
 * Reads the `focus` search param, resolves it to an ingredient id via the
 * already-loaded list (lookup-by-slug is O(n) on a list capped at hundreds),
 * selects + scrolls + highlights for 2 seconds per the PRD AC, and emits
 * a not-found message via the returned `notFoundSlug` when the slug
 * doesn't match anything.
 *
 * The hook owns the highlight timer so re-navigations to the same slug
 * re-trigger the visual cue.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useSearchParams } from 'react-router';

import type { IngredientRow } from './ingredient-wire-types.js';

const HIGHLIGHT_DURATION_MS = 2000;

interface Args {
  ingredients: readonly IngredientRow[];
  isListLoading: boolean;
  onResolved: (id: number) => void;
  onExpandAncestors: (ids: readonly number[]) => void;
}

export function useFocusedIngredient({
  ingredients,
  isListLoading,
  onResolved,
  onExpandAncestors,
}: Args) {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const focusSlug = searchParams.get('focus');
  const [highlightedId, setHighlightedId] = useState<number | null>(null);
  const [notFoundSlug, setNotFoundSlug] = useState<string | null>(null);
  // Keyed by `(slug, location.key)` so re-navigating to the same `?focus=<slug>`
  // re-triggers the resolve + highlight — react-router mints a new key per
  // navigation even when the URL is unchanged, so this re-fires the effect
  // without thrashing on intra-page renders.
  const lastResolvedKey = useRef<string | null>(null);

  const bySlug = useMemo(() => {
    const map = new Map<string, IngredientRow>();
    for (const row of ingredients) map.set(row.slug, row);
    return map;
  }, [ingredients]);
  const byId = useMemo(() => {
    const map = new Map<number, IngredientRow>();
    for (const row of ingredients) map.set(row.id, row);
    return map;
  }, [ingredients]);

  useEffect(() => {
    if (focusSlug === null) {
      lastResolvedKey.current = null;
      setHighlightedId(null);
      setNotFoundSlug(null);
      return;
    }
    if (isListLoading) return;
    const key = `${location.key}:${focusSlug}`;
    if (lastResolvedKey.current === key) return;

    const match = bySlug.get(focusSlug);
    if (match === undefined) {
      setNotFoundSlug(focusSlug);
      lastResolvedKey.current = key;
      return;
    }
    lastResolvedKey.current = key;
    setNotFoundSlug(null);

    const ancestors = collectAncestors(byId, match.id);
    if (ancestors.length > 0) onExpandAncestors(ancestors);
    onResolved(match.id);
    setHighlightedId(match.id);
  }, [focusSlug, location.key, isListLoading, bySlug, byId, onResolved, onExpandAncestors]);

  useEffect(() => {
    if (highlightedId === null) return;
    const handle = window.setTimeout(() => setHighlightedId(null), HIGHLIGHT_DURATION_MS);
    return () => window.clearTimeout(handle);
  }, [highlightedId]);

  const acknowledgeNotFound = () => setNotFoundSlug(null);

  return { highlightedId, notFoundSlug, acknowledgeNotFound };
}

function collectAncestors(byId: Map<number, IngredientRow>, leafId: number): number[] {
  const acc: number[] = [];
  let cursor = byId.get(leafId)?.parentId ?? null;
  while (cursor !== null) {
    const parent = byId.get(cursor);
    if (parent === undefined) break;
    acc.push(parent.id);
    cursor = parent.parentId;
  }
  return acc;
}
