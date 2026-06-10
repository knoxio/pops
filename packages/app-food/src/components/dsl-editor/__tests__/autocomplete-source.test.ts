/**
 * CompletionSource integration suite (PRD-120 part B).
 *
 * Drives `buildDslCompletionSource` directly with a fake
 * `CompletionContext` so we can assert the result shape (options list,
 * insertion range, validFor regex) without spinning up a CodeMirror
 * EditorState. Each test stubs `DslAutocompleteSources` with a recorder
 * so we can also assert the lookup was called with the expected query
 * + kinds.
 */
import { EditorState } from '@codemirror/state';
import { describe, expect, it, vi } from 'vitest';

import { buildDslCompletionSource } from '../autocomplete-source';

import type { DslAutocompleteSources, SlugKind } from '../autocomplete-types';

function makeContext(
  text: string,
  { readOnly = false, explicit = false }: { readOnly?: boolean; explicit?: boolean } = {}
) {
  const cursor = text.indexOf('|');
  if (cursor === -1) throw new Error('fixture missing | marker');
  const docText = text.slice(0, cursor) + text.slice(cursor + 1);
  const state = EditorState.create({
    doc: docText,
    extensions: readOnly ? [EditorState.readOnly.of(true)] : [],
  });
  // CodeMirror's CompletionContext type carries a few private fields
  // (`abortListeners`, `parent`) we don't care about here. The source
  // only reads `state`, `pos`, and `explicit`, plus calls `matchBefore`
  // implicitly via the classifier — none of which we use.
  return {
    state,
    pos: cursor,
    explicit,
    aborted: false,
    addEventListener: () => {},
    tokenBefore: () => null,
    matchBefore: () => null,
  } as unknown as Parameters<ReturnType<typeof buildDslCompletionSource>>[0];
}

function makeSources(): {
  sources: DslAutocompleteSources;
  searchSpy: ReturnType<typeof vi.fn>;
  variantSpy: ReturnType<typeof vi.fn>;
  prepSpy: ReturnType<typeof vi.fn>;
} {
  const searchSpy = vi.fn(async (_query: string, _kinds?: readonly SlugKind[]) => [
    { slug: 'banana', kind: 'ingredient' as const, name: 'Banana' },
    { slug: 'beans', kind: 'ingredient' as const, name: 'Beans' },
  ]);
  const variantSpy = vi.fn(async () => [
    { slug: 'raw', name: 'Raw' },
    { slug: 'ripe', name: 'Ripe' },
  ]);
  const prepSpy = vi.fn(async () => [
    { slug: 'diced', name: 'Diced' },
    { slug: 'mashed', name: 'Mashed' },
  ]);
  return {
    sources: {
      searchSlugs: searchSpy as unknown as DslAutocompleteSources['searchSlugs'],
      listVariantsForIngredient:
        variantSpy as unknown as DslAutocompleteSources['listVariantsForIngredient'],
      listPrepStates: prepSpy as unknown as DslAutocompleteSources['listPrepStates'],
    },
    searchSpy,
    variantSpy,
    prepSpy,
  };
}

describe('dslCompletionSource', () => {
  it('returns null when the cursor classifier reports no context', async () => {
    const { sources } = makeSources();
    const source = buildDslCompletionSource(sources);
    const result = await source(makeContext('Some markdown body|.'));
    expect(result).toBeNull();
  });

  it('surfaces the six DSL function names after a bare @', async () => {
    const { sources } = makeSources();
    const source = buildDslCompletionSource(sources);
    const result = await source(makeContext('@|'));
    expect(result).not.toBeNull();
    const labels = result?.options.map((o) => o.label);
    expect(labels).toEqual(['@recipe', '@yield', '@ingredient', '@step', '@time', '@temperature']);
  });

  it('calls searchSlugs for the descriptor-slug position', async () => {
    const { sources, searchSpy } = makeSources();
    const source = buildDslCompletionSource(sources);
    const result = await source(makeContext('@ingredient(1, ban|'));
    expect(searchSpy).toHaveBeenCalledWith('ban', ['ingredient', 'recipe']);
    expect(result?.options.map((o) => o.label)).toEqual(['banana', 'beans']);
  });

  it('calls listVariantsForIngredient inside the variant slot', async () => {
    const { sources, variantSpy } = makeSources();
    const source = buildDslCompletionSource(sources);
    const result = await source(makeContext('@ingredient(1, banana:|'));
    expect(variantSpy).toHaveBeenCalledWith('banana');
    expect(result?.options.map((o) => o.label)).toEqual(['raw', 'ripe']);
  });

  it('calls listPrepStates inside the prep-state slot', async () => {
    const { sources, prepSpy } = makeSources();
    const source = buildDslCompletionSource(sources);
    const result = await source(makeContext('@ingredient(1, banana:raw:|'));
    expect(prepSpy).toHaveBeenCalled();
    expect(result?.options.map((o) => o.label)).toEqual(['diced', 'mashed']);
  });

  it('returns canonical unit suggestions after qty:', async () => {
    const { sources } = makeSources();
    const source = buildDslCompletionSource(sources);
    const result = await source(makeContext('@yield(beef, 500:|'));
    const labels = result?.options.map((o) => o.label);
    expect(labels?.slice(0, 3)).toEqual(['g', 'ml', 'count']);
    expect(labels).toContain('cup');
    expect(labels).toContain('min');
  });

  it('combines indexes + slug search for step-ref position', async () => {
    const { sources, searchSpy } = makeSources();
    const source = buildDslCompletionSource(sources);
    const result = await source(makeContext('@ingredient(1, banana, 100:g)\n@step("Mash @|")'));
    expect(searchSpy).toHaveBeenCalledWith('', ['ingredient', 'recipe']);
    const labels = result?.options.map((o) => o.label) ?? [];
    expect(labels[0]).toBe('@1'); // index entry from the @ingredient declaration
    expect(labels).toContain('@banana');
  });

  it('falls back to a "Create new" affordance when slug search returns nothing', async () => {
    const empty: DslAutocompleteSources = {
      searchSlugs: async () => [],
      listVariantsForIngredient: async () => [],
      listPrepStates: async () => [],
    };
    const source = buildDslCompletionSource(empty);
    const result = await source(makeContext('@ingredient(1, novel-slug|'));
    expect(result?.options).toHaveLength(1);
    expect(result?.options[0]?.detail).toMatch(/Create new ingredient/);
  });

  it('returns null for empty descriptor-slug query when slugs come back empty (no popup spam)', async () => {
    const empty: DslAutocompleteSources = {
      searchSlugs: async () => [],
      listVariantsForIngredient: async () => [],
      listPrepStates: async () => [],
    };
    const source = buildDslCompletionSource(empty);
    const result = await source(makeContext('@ingredient(1, |'));
    expect(result).toBeNull();
  });

  describe('read-only mode (PRD-120 part F)', () => {
    it('returns null at @ even when the cursor is in a function-name context', async () => {
      const { sources, searchSpy } = makeSources();
      const source = buildDslCompletionSource(sources);
      const result = await source(makeContext('@|', { readOnly: true }));
      expect(result).toBeNull();
      expect(searchSpy).not.toHaveBeenCalled();
    });

    it('returns null inside descriptor-slug context without ever calling searchSlugs', async () => {
      const { sources, searchSpy } = makeSources();
      const source = buildDslCompletionSource(sources);
      const result = await source(makeContext('@ingredient(1, bana|', { readOnly: true }));
      expect(result).toBeNull();
      expect(searchSpy).not.toHaveBeenCalled();
    });

    it('returns null inside step-ref context without ever calling searchSlugs', async () => {
      const { sources, searchSpy } = makeSources();
      const source = buildDslCompletionSource(sources);
      const result = await source(
        makeContext('@ingredient(1, banana, 100:g)\n@step("Mash @|")', { readOnly: true })
      );
      expect(result).toBeNull();
      expect(searchSpy).not.toHaveBeenCalled();
    });

    it('returns null on explicit (Ctrl-Space) invocation in a function-name slot', async () => {
      const { sources, searchSpy } = makeSources();
      const source = buildDslCompletionSource(sources);
      const result = await source(makeContext('@|', { readOnly: true, explicit: true }));
      expect(result).toBeNull();
      expect(searchSpy).not.toHaveBeenCalled();
    });

    it('returns null on explicit invocation inside descriptor-slug (Ctrl-Space at empty query)', async () => {
      const { sources, searchSpy } = makeSources();
      const source = buildDslCompletionSource(sources);
      // Without read-only, the explicit + empty-query combo would surface
      // the "Create new ingredient" affordance (see the implicit suite
      // above); the read-only gate must override that path too.
      const result = await source(
        makeContext('@ingredient(1, |', { readOnly: true, explicit: true })
      );
      expect(result).toBeNull();
      expect(searchSpy).not.toHaveBeenCalled();
    });
  });
});
