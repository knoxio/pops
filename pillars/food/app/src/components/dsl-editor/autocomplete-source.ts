import { classifyCursor, type CursorContext } from './autocomplete-context';
import { collectStepIndexes } from './autocomplete-step-bodies';
import { DSL_FUNCTION_SUGGESTIONS, DSL_UNIT_SUGGESTIONS } from './autocomplete-units';

/**
 * DSL editor autocomplete — CompletionSource wiring.
 *
 * Single CodeMirror `CompletionSource` that classifies the cursor
 * position via `classifyCursor` (pure) and then fan-outs to whichever
 * fetch the active context needs. The function itself is async — the
 * slug-search and variant lookups are network-bound — but the
 * classification + the unit / function-name / step-ref sources resolve
 * synchronously.
 *
 * CodeMirror's `autocompletion` extension handles the popup, the
 * debounce (`activateOnTypingDelay`, defaults to 100 ms), and the
 * abort-on-keypress race conditions. We never have to thread an
 * `AbortSignal` through the lookups; if the source resolves after the
 * user kept typing, CodeMirror discards the result.
 */
import type { Completion, CompletionContext, CompletionResult } from '@codemirror/autocomplete';

import type {
  DslAutocompleteSources,
  PrepStateSuggestion,
  SlugSuggestion,
  VariantSuggestion,
} from './autocomplete-types';

export function buildDslCompletionSource(sources: DslAutocompleteSources) {
  return async function dslCompletionSource(
    context: CompletionContext
  ): Promise<CompletionResult | null> {
    // Published versions render in read-only mode; the popup must not open
    // even for explicit Ctrl-Space requests since the user can't apply a
    // suggestion to a frozen document anyway.
    if (context.state.readOnly) return null;
    const text = context.state.doc.toString();
    const ctx = classifyCursor(text, context.pos);
    if (ctx.kind === 'none') {
      // CodeMirror calls sources eagerly on every keystroke; returning
      // `null` here is cheap and tells the autocompletion machinery to
      // skip this source.
      return null;
    }
    return await dispatch(text, ctx, sources, context.explicit);
  };
}

async function dispatch(
  text: string,
  ctx: CursorContext,
  sources: DslAutocompleteSources,
  explicit: boolean
): Promise<CompletionResult | null> {
  if (ctx.kind === 'function-name') return functionResult(ctx);
  if (ctx.kind === 'unit') return unitResult(ctx);
  if (ctx.kind === 'descriptor-slug') {
    const items = await sources.searchSlugs(ctx.query, ['ingredient', 'recipe']);
    return slugResult(ctx, items, explicit);
  }
  if (ctx.kind === 'descriptor-variant') {
    const items = await sources.listVariantsForIngredient(ctx.ingredientSlug);
    return variantResult(ctx, items);
  }
  if (ctx.kind === 'descriptor-prep') {
    const items = await sources.listPrepStates();
    return prepResult(ctx, items);
  }
  if (ctx.kind === 'step-ref') {
    const indexes = collectStepIndexes(text);
    const slugItems = await sources.searchSlugs(ctx.query, ['ingredient', 'recipe']);
    return stepRefResult(ctx, indexes, slugItems);
  }
  return null;
}

function functionResult(ctx: Extract<CursorContext, { kind: 'function-name' }>): CompletionResult {
  return {
    from: ctx.from,
    to: ctx.from + 1 + ctx.query.length, // include the @ prefix in replacement
    options: DSL_FUNCTION_SUGGESTIONS.map((fn) => ({
      label: `@${fn.slug}`,
      detail: fn.label,
      apply: `@${fn.slug}`,
      type: 'keyword' satisfies Completion['type'],
    })),
    validFor: /^@[a-z]*$/,
  };
}

function unitResult(ctx: Extract<CursorContext, { kind: 'unit' }>): CompletionResult {
  return {
    from: ctx.from,
    options: DSL_UNIT_SUGGESTIONS.map((u) => ({
      label: u.slug,
      detail: u.label,
      type: 'unit' satisfies Completion['type'],
    })),
    validFor: /^[a-z]*$/,
  };
}

function slugResult(
  ctx: Extract<CursorContext, { kind: 'descriptor-slug' }>,
  items: readonly SlugSuggestion[],
  explicit: boolean
): CompletionResult | null {
  if (items.length === 0) {
    // Surface the "Create new ingredient" affordance, but only when the
    // user explicitly invoked autocomplete OR typed at least one
    // character. Empty + implicit = no popup at all.
    if (!explicit && ctx.query === '') return null;
    if (ctx.query === '') return null;
    return {
      from: ctx.from,
      options: [
        {
          label: ctx.query,
          detail: `Create new ingredient "${ctx.query}"`,
          apply: ctx.query,
          type: 'text' satisfies Completion['type'],
        },
      ],
      validFor: /^[a-z0-9-]*$/,
    };
  }
  return {
    from: ctx.from,
    options: items.map((item) => ({
      label: item.slug,
      detail: item.name === '' ? item.kind : `${item.kind} · ${item.name}`,
      type: item.kind === 'recipe' ? 'function' : 'variable',
    })),
    validFor: /^[a-z0-9-]*$/,
  };
}

function variantResult(
  ctx: Extract<CursorContext, { kind: 'descriptor-variant' }>,
  items: readonly VariantSuggestion[]
): CompletionResult | null {
  if (items.length === 0) return null;
  return {
    from: ctx.from,
    options: items.map((item) => ({
      label: item.slug,
      detail: item.name,
      type: 'variable' satisfies Completion['type'],
    })),
    validFor: /^[a-z0-9-]*$/,
  };
}

function prepResult(
  ctx: Extract<CursorContext, { kind: 'descriptor-prep' }>,
  items: readonly PrepStateSuggestion[]
): CompletionResult | null {
  if (items.length === 0) return null;
  return {
    from: ctx.from,
    options: items.map((item) => ({
      label: item.slug,
      detail: item.name,
      type: 'enum' satisfies Completion['type'],
    })),
    validFor: /^[a-z0-9-]*$/,
  };
}

function stepRefResult(
  ctx: Extract<CursorContext, { kind: 'step-ref' }>,
  indexes: readonly { index: string; slug: string }[],
  slugItems: readonly SlugSuggestion[]
): CompletionResult {
  const indexOptions: Completion[] = indexes.map((entry) => ({
    label: `@${entry.index}`,
    detail: entry.slug === '' ? `index ${entry.index}` : `→ ${entry.slug}`,
    apply: `@${entry.index}`,
    type: 'constant',
  }));
  const slugOptions: Completion[] = slugItems.map((item) => ({
    label: `@${item.slug}`,
    detail: item.name === '' ? item.kind : `${item.kind} · ${item.name}`,
    apply: `@${item.slug}`,
    type: item.kind === 'recipe' ? 'function' : 'variable',
  }));
  return {
    from: ctx.from,
    to: ctx.from + 1 + ctx.query.length,
    options: [...indexOptions, ...slugOptions],
    validFor: /^@[a-z0-9-]*$/,
  };
}
