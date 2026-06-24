# DSL Editor

**Status: Done** — the `DslEditor` React component, its Lezer grammar, autocomplete, inline issue squiggles, chip widgets, structural reorder/renumber, read-only mode, and the full test + Storybook suite all ship in `pillars/food/app/src`.

## Purpose

The DSL-aware editor recipe authors use whenever they edit a recipe version's `body_dsl`. CodeMirror 6 + a Lezer grammar power syntax highlighting, autocomplete fed by the slug registry and the prep-state catalogue, and inline error squiggles driven by compile diagnostics.

The editor is **input only** — it produces a `body_dsl` string via `onChange`. It never fetches recipe state, compiles, or writes to a backend. Compilation, side-panel error display, and ingredient-creation prompts are the wrapping recipe-edit page's concern ([recipe-crud-pages](../recipe-crud-pages/README.md) / [draft-inspector](../draft-inspector/README.md)); rendering for the read-only cookbook view is the renderer's ([dsl-renderer](../dsl-renderer/README.md)).

Lives at `pillars/food/app/src/components/DslEditor.tsx` and `pillars/food/app/src/components/dsl-editor/*`; the grammar + parity scaffolding at `pillars/food/app/src/dsl/*`.

## Component API

```tsx
export interface DslEditorProps {
  initialValue: string; // current body_dsl; document rebuilt only when this changes from outside
  onChange: (value: string) => void; // latest editor value, debounced 250ms
  issues?: readonly CompileEditorIssue[]; // unified diagnostics: errors (red) + proposed slugs (info/blue)
  readOnly?: boolean; // true for current/archived versions
  className?: string;
  autocompleteSources?: DslAutocompleteSources; // omit => empty dropdown; production wiring = useDslAutocompleteSources()
  pendingCursor?: { line: number; col: number; nonce: number }; // imperative cursor-move target (1-indexed; nonce re-triggers)
}

export interface CompileEditorIssue {
  severity: 'error' | 'info';
  code: string; // ParseErrorCode | ResolveErrorCode | CycleErrorCode | 'ProposedSlug'
  message: string;
  loc: SourceSpan; // dsl-parser 1-indexed line/col, endCol exclusive
  slug?: string; // set on ProposedSlug + resolve errors that named a slug
}
```

The editor consumes one flat `issues` list. The parent (the recipe-edit / draft-review pages) assembles it from the save-time `CompileResult` (parse/resolve/cycle errors) plus the version's proposed-slug rows, tagging each with `severity`.

## Backend Surface (consumed, not owned)

Autocomplete is the editor's only network dependency. `useDslAutocompleteSources()` wires three lookups through the generated Hey API REST SDK (`pillars/food/app/src/food-api`); React Query is intentionally not involved — CodeMirror owns its own per-keystroke calls. Each lookup swallows network/auth errors and resolves to an empty list (throwing inside a `CompletionSource` would disable autocomplete for the session).

| Lookup                            | REST endpoint                                                                                                                                           | Contract              |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `searchSlugs(query, kinds)`       | `GET /slugs/search?query&kinds[]&limit` → `{ items: SlugMatch[] }` (`SlugMatch = { slug, kind: 'ingredient'\|'recipe'\|'prep_state', targetId, name }`) | `rest-slugs.ts`       |
| `listVariantsForIngredient(slug)` | `GET /ingredients/:idOrSlug` → reads `.variants`                                                                                                        | `rest-ingredients.ts` |
| `listPrepStates()`                | `GET /prep-states` → `{ items: PrepState[] }`                                                                                                           | `rest-prep-states.ts` |

## Lezer Grammar

`pillars/food/app/src/dsl/dsl.grammar`, compiled to the committed `dsl-parser.ts` / `dsl-parser.terms.ts` via `@lezer/generator` (regenerate with `mise food:dsl:generate`; the `-parser.ts` suffix keeps Vite from parsing the `.grammar` source as JS). The hand-rolled parser in `pillars/food/src/dsl` ([dsl-parser](../dsl-parser/README.md), exported browser-safe as `@pops/food/dsl` → `parseRecipeDsl` / `SourceSpan`) is the semantic source of truth; this grammar is a CodeMirror-only mirror for highlighting, folding, and bracket matching.

The grammar models calls generically — `Call { FunctionName "(" ArgList? ")" }`, `FunctionName { "@" Identifier }`, args of `NamedArg | Value`, `Value { String | Boolean | QtyUnit | Descriptor | Number }`, `QtyUnit { Number ":" Identifier }`, `Descriptor { Identifier (":" DescriptorPart (":" DescriptorPart)?)? }` with `DescriptorPart = Identifier | "_"`. Markdown prose between calls is NOT a production: a greedy `ProseChunk` skip-token (lines starting `[A-Z#>.!?;]`) plus Lezer error recovery resyncs at the next `@` or `//`, so prose renders as plain text.

- **Highlight tags**: function names → keyword; descriptor slugs → variable; strings → string; numbers → number; comments → comment.
- **Folding** on multi-line `@recipe(...)` blocks; **bracket matching** on call parens.

## Autocomplete

A single `CompletionSource` (`buildDslCompletionSource`) classifies the cursor (`classifyCursor`, pure) then fans out. Synchronous sources resolve inline; slug/variant lookups are network-bound. CodeMirror's `autocompletion` extension owns the popup, debounce, and abort-on-keypress races.

| Cursor position                                      | Suggestions                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| After `@`                                            | 6 function names: `recipe`, `yield`, `ingredient`, `step`, `time`, `temperature`                                   |
| Inside `@ingredient(N, ` / `@yield(` descriptor slot | `searchSlugs(query, ['ingredient','recipe'])`; empty result + non-empty query → "Create new ingredient" affordance |
| After a known ingredient slug + `:`                  | that ingredient's variants (`listVariantsForIngredient`)                                                           |
| After `slug:variant:`                                | curated prep states (`listPrepStates`)                                                                             |
| `qty:unit` after `:`                                 | 13 common units (`g ml count cup tbsp tsp oz lb min s c f none`)                                                   |
| Inside a `@step("...")` body after `@`               | declared ingredient indexes (`collectStepIndexes`) unioned with `searchSlugs(query, ['ingredient','recipe'])`      |

When `state.readOnly` is true the source short-circuits to `null` — the popup never opens, even on explicit Ctrl-Space.

## Issue Squiggles

Each issue's `loc: SourceSpan` resolves to a half-open `[from, to)` offset range and a `Decoration.mark`: `cm-dsl-issue--error` (red underline) for `severity='error'`, `cm-dsl-issue--info` (blue) for `severity='info'` (proposed slugs). A gutter marker and a hover tooltip (`data-testid="dsl-editor-issue-tooltip"`, showing message + code + slug) accompany the underline. The editor does NOT re-parse as the user types — error feedback is stale between saves (intentional for v1; the page recompiles on save and feeds `issues` back). Squiggles repaint on the next render when `issues` changes; cursor position is preserved.

## Chip Widgets

Inline `@N` and `@slug` refs in step bodies render as widgets:

- `@N` / `@slug` → a chip showing the resolved ingredient name; clicking (or Enter/Space) jumps the cursor to the matching `@ingredient(N, ...)` declaration (`data-chip-jump-from`). Unresolved refs render in an error state with the underline + tooltip.
- `@time(N:unit)` / `@temperature(N:unit)` → a non-interactive pill ("20 min" / "180 °C") via `formatPillLabel`.

On mobile widths (`max-width: 767px`, tracked by a `matchMedia` listener in `useDslEditorView`) chips swap via a CodeMirror compartment to inline `Decoration.mark` labels rather than widget replacements, keeping tap targets safe; autocomplete pins to a bottom drawer at the viewport floor on the same breakpoint.

## Reorder & Renumber

A "Reorder ingredients" toolbar button opens `ReorderIngredientsPanel` (drag-sort of the parsed `@ingredient(N, ...)` blocks, driven by `useReorderController`). Confirming rewrites the DSL text — renumbering both the declarations and the `@N` step refs — as **one undoable CodeMirror transaction** (`applyReorder`). Slug refs (`@banana`) are never touched; only integer `@N` refs are remapped. Pure typed cut/paste does not auto-renumber.

## Read-Only Mode

When `readOnly={true}` (parent passes this for published/archived versions): `EditorView.editable.of(false)` + `EditorState.readOnly` block all keystrokes, a `role="status"` banner shows at the top, autocomplete and the page's Recompile button are disabled. Highlighting and chips still render so the document reads cleanly. Chip clicks still jump the cursor.

## Business Rules

- Pure presentation component; `onChange` is the only outbound channel; the editor never writes to a backend or owns compile state.
- The Lezer grammar must stay in sync with the [dsl-parser](../dsl-parser/README.md) parser — a parity test feeds the sample recipes through both and asserts the top-level call sequence matches (drift trip-wire).
- Chip widgets are keyboard-navigable (arrow keys to move past them; Enter/Space to activate).
- The component degrades gracefully below 768px (inline chip labels + bottom-drawer autocomplete).

## Edge Cases

| Case                                                     | Behaviour                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `slug_registry` returns 0 matches with a non-empty query | dropdown shows "Create new ingredient: `<typed-slug>`"                       |
| Empty query, no match, implicit invocation               | no popup                                                                     |
| `@badname` after `@`                                     | no match; renders as plain/unknown, surfaced on save                         |
| `issues` changes mid-edit                                | squiggles repaint next render; cursor preserved                              |
| `readOnly` toggled mid-session                           | re-renders read-only; in-flight local edits dropped (version is locked)      |
| Chip click while read-only                               | still jumps the cursor                                                       |
| `@99` step ref with only 1–3 indexes                     | chip renders in error state after compile (`UnresolvedStepRefIndex` tooltip) |

## Acceptance Criteria

### Component & grammar

- [x] `DslEditor.tsx` exports `DslEditor` with the props shape above.
- [x] CodeMirror 6 + `@lezer/generator` are dependencies; `dsl.grammar` compiles to the committed `dsl-parser.ts` via `mise food:dsl:generate`.
- [x] Parity test (`dsl/__tests__/lezer-parity.test.ts`) parses each sample recipe with both the Lezer grammar and the [dsl-parser](../dsl-parser/README.md) parser and asserts the call structure matches.

### Autocomplete

- [x] After `@`, the list shows the 6 function names (`autocomplete-source.test.ts`).
- [x] Inside `@ingredient(1, ` the source calls `GET /slugs/search` with `['ingredient','recipe']` and shows results.
- [x] After a known ingredient slug + `:`, the list shows that ingredient's variants (via `GET /ingredients/:idOrSlug`).
- [x] After `slug:variant:`, the list shows the curated prep states (via `GET /prep-states`).
- [x] Inside a `@step("...")` body, `@` shows declared indexes unioned with a fuzzy slug search.

### Issues

- [x] An issue with a `loc: SourceSpan` renders an underline at exactly that location (`dsl-editor-issues-span.test.ts`, `DslEditor.test.tsx`).
- [x] Hover on the underline shows the message + code + slug (`data-testid="dsl-editor-issue-tooltip"`).
- [x] `severity='info'` → blue marker, `severity='error'` → red squiggle (`data-dsl-issue-severity` asserted).

### Chips

- [x] `@1` in a step body renders a chip with the ingredient name; click / Enter / Space jumps to `@ingredient(1, ...)`.
- [x] `@time(20:min)` renders a "20 min" pill (and `@temperature` as "180 °C").
- [x] On mobile widths chips become inline labels; tap navigation still works.

### Reorder & read-only

- [x] "Reorder ingredients" opens a drag-sortable list; confirming renumbers declarations + `@N` refs in one undoable transaction; slug refs untouched (`DslEditor.reorder.test.tsx`).
- [x] `readOnly={true}`: no keystroke modifies the document, banner shown, autocomplete (and the page's Recompile button) disabled.

### Accessibility & tests

- [x] Passes axe-core basic checks across editable / read-only / empty variants (`DslEditor.accessibility.test.tsx`); accessible name on `.cm-content`, chips keyboard-reachable.
- [x] At 375px the editor stays usable: no horizontal overflow; autocomplete uses the bottom drawer.
- [x] RTL suite (`__tests__/DslEditor.test.tsx`) covers each criterion with a synthetic `DslAutocompleteSources`; Storybook (`DslEditor.stories.tsx`) covers empty / sample / errors / proposed-slugs / mixed / read-only.

## Out of Scope

- Compile invocation (parse + resolve + materialise) — the recipe-edit / draft-review pages, on save ([recipe-crud-pages](../recipe-crud-pages/README.md), [draft-inspector](../draft-inspector/README.md)).
- DSL renderer for the read-only cookbook view — [dsl-renderer](../dsl-renderer/README.md).
- Worker-thread parsing for live error feedback — deferred; v1 errors are stale-between-saves only.
- Collaborative / multi-cursor editing, Vim/Emacs keymaps, image paste into the editor.
