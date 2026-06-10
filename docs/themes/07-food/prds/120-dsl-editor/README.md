# PRD-120: DSL CodeMirror Editor

> Epic: [01 — Recipe & Ingredient Management](../../epics/01-recipe-ingredient-management.md)

## Overview

Build the DSL-aware editor that recipe authors use whenever they edit `recipe_versions.body_dsl`. CodeMirror 6 + a Lezer grammar matching ADR-023 powers syntax highlighting, autocomplete fed by `slug_registry` and the prep_state catalogue, and inline error squiggles driven by PRD-116's `compile_error` JSON. The editor is a React component that the recipe edit page (PRD-119) wraps with save / save-as-new-version controls.

The editor is **input only** — it produces a `body_dsl` string. Compilation, error display in side panels, and ingredient creation prompts are downstream concerns handled by the page wrapping the editor (PRD-119) and the renderer (PRD-121).

## Component API

```tsx
// packages/app-food/src/components/DslEditor.tsx
export type DslEditorProps = {
  initialValue: string; // current body_dsl
  onChange: (value: string) => void; // fires on every keystroke (debounced)
  issues?: CompileEditorIssue[]; // unified list: errors + proposed slugs, each with severity + SourceSpan
  readOnly?: boolean; // true for `current` versions (PRD-107 forbids edit)
  className?: string;
};

// The editor consumes a single flat list. The parent (PRD-119) assembles this list from:
//   - errors returned by `food.recipes.saveDraft`'s CompileResult (parse / resolve / cycle errors)
//   - rows from `recipe_version_proposed_slugs` (PRD-116) for the current versionId, fetched via
//     `food.recipes.listProposedSlugs(versionId)` (defined in PRD-119)
// Each issue carries `severity` so the editor colours errors red and proposed slugs blue.
export type CompileEditorIssue = {
  severity: 'error' | 'info';
  code: string; // ParseErrorCode | ResolveErrorCode | 'ProposedSlug'
  message: string;
  loc: SourceSpan;
  slug?: string;
};

export function DslEditor(props: DslEditorProps): JSX.Element;
```

`onChange` fires on every change, debounced internally to 250ms to keep autocomplete responsive without thrashing parent state. The page is responsible for storing the value, calling save, and feeding back issues from the most recent compile.

`issues` uses the SourceSpan from PRD-114 to position the squiggle / marker. The editor doesn't run the parser itself — it consumes whatever the parent supplies.

## Lezer Grammar

CodeMirror 6 parses incrementally via Lezer. A custom grammar file matches the DSL grammar from PRD-114:

```
// packages/app-food/src/dsl/dsl.grammar
@top Recipe { (comment | block)+ }

block { recipeCall | yieldCall | ingredientCall | stepCall | markdown }

recipeCall    { "@recipe" "(" namedArgs ")" }
yieldCall     { "@yield" "(" descriptor "," qtyUnit ")" }
ingredientCall { "@ingredient" "(" Integer "," descriptor "," qtyUnit ("," namedArg)* ")" }
stepCall      { "@step" "(" String ("," namedArg)* ")" }

descriptor    { Identifier (":" (Identifier | "_")  (":" (Identifier | "_"))?)? }
qtyUnit       { Number ":" Identifier | "0:none" }
namedArgs     { namedArg ("," namedArg)* }
namedArg      { Identifier "=" Value }
Value         { String | Number | Boolean | qtyUnit | descriptor }

@tokens {
  Identifier { $[a-z] $[a-z0-9\-]* }
  Integer    { $[0-9]+ }
  Number     { ($[\-])? $[0-9]+ ("." $[0-9]+)? }
  String     { '"' (![\"\\] | "\\" _)* '"' }
  Boolean    { "true" | "false" }
  comment    { "//" ![\n]* }
}
```

Grammar compiles to a CodeMirror language extension at build time via `@lezer/generator`. The extension provides:

- **Highlight tags**: function names (`@recipe`, `@yield`, `@ingredient`, `@step`, `@time`, `@temperature`) → keyword; slugs in descriptors → variable; strings → string; numbers → number; comments → comment.
- **Folding**: `@recipe(...)` blocks are foldable when they span multiple lines.
- **Bracket matching**: parens inside function calls.

Inline references in step strings (`@1`, `@slug`, `@time(...)`) are highlighted via a separate inner tokenizer applied to string contents.

## Autocomplete

CodeMirror's `autocompletion` extension is fed by context-aware sources:

| Cursor position                                         | Suggestion source                                                                                |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| After `@`                                               | Function names: `recipe`, `yield`, `ingredient`, `step`, `time`, `temperature`                   |
| Inside `@ingredient(N, ` or `@yield(`                   | Slugs from `slug_registry` (ingredients first, then recipes); fuzzy match                        |
| Inside `descriptor` after a known ingredient slug + `:` | Variants of that ingredient (from `ingredient_variants` for the resolved parent)                 |
| Inside `descriptor` after `ingredient:variant:`         | prep_state slugs (curated list of 15)                                                            |
| Inside `qty:unit` after `:`                             | Common units: `g`, `ml`, `count`, `cup`, `tbsp`, `tsp`, `oz`, `lb`, `min`, `s`, `c`, `f`, `none` |
| Inside a `@step("...")` body after `@`                  | Ingredient indexes (`1`, `2`, ...) declared above + ingredient slugs from registry               |
| After `key=` in named args                              | Suggestions matching the named arg's type (boolean, slug, qty:unit)                              |

Slug suggestions are fetched via a tRPC procedure `food.slugs.search(query, kinds)` exposed by the food backend module (introduced when Epic 00 services land). The procedure returns up to 50 matches, ranked by edit distance from the query. Results are cached in React Query for the session.

## Error Squiggles

When `errors` prop is non-empty, each error's `loc: SourceSpan` is converted to a CodeMirror `Decoration.mark` with a class that draws a red underline. Hovering shows the error message in a tooltip. Proposed-slug entries from PRD-115 render as a blue underline + info-icon tooltip with the resolver's suggested action.

The editor does NOT re-run the parser as the user types — error feedback is "stale" between saves. This is intentional for v1: live parsing during typing would either need a worker thread (complex) or block the main thread (laggy). The parent (PRD-119) compiles on save and feeds errors back.

A "Recompile" button at the bottom of the editor lets the user explicitly trigger a parse-only check without saving — the page handles this by calling `parseRecipeDsl` (PRD-114) without the resolver, surfacing structure-only errors for quick iteration.

## Chip Rendering

Inline `@N` and `@slug` references inside step bodies are decorated as **chips** — a CodeMirror widget that replaces the raw text with a styled span showing the resolved ingredient name. Clicking a chip jumps the cursor to the matching `@ingredient(N, ...)` declaration block above.

Chips re-render when the parent prop updates (e.g. after a save that promoted the version). On unresolved refs (PRD-115 emitted `UnresolvedStepRefIndex` or `UnresolvedStepRefSlug`), the chip renders in an error state with the underline + tooltip.

For `@time(N:unit)` and `@temperature(N:unit)` inline calls, the chip renders as a small pill ("20 min" / "180 °C") — non-interactive in the editor (the renderer in PRD-121 makes them clickable for cooking mode).

## Reordering & Index Re-numbering

When the user reorders `@ingredient(N, ...)` blocks (drag-handle or cut/paste), the index references in step bodies must update too. v1 approach:

- Editor provides a "Reorder ingredients" affordance (button or drag-handle in a side panel) that operates on the DSL structurally.
- When invoked, the editor parses the current text, lets the user reorder, then regenerates the text with new indices AND rewrites all `@N` refs in step bodies to point at the new positions.
- Pure cut/paste reordering by the user (typing) does NOT auto-renumber — that would surprise; the user can hit "renumber" manually if they want.

The renumber action is one editor transaction (single undo).

## Read-Only Mode

When `readOnly={true}` (the parent passes this for a `current` version per PRD-107's `CannotEditPublishedVersion` rule), the editor:

- Disables all keyboard input on the document.
- Shows a banner at the top: "This version is published. Create a new draft to edit."
- Still renders syntax highlighting and chips (so the user can read clearly).
- Disables autocomplete and the Recompile button.

## Business Rules

- The editor is a pure React component. No data fetching beyond the slug-search procedure for autocomplete.
- `onChange` is the only outbound channel. The editor never writes to the database directly.
- The editor does not own compile state — the parent (PRD-119) calls `compileRecipeVersion` after saving and feeds back errors.
- The Lezer grammar is the source of truth for highlighting; if it diverges from PRD-114's parser, parsing errors in the editor and parse failures on save will disagree. Acceptance criterion below catches this with a round-trip test.
- Chip widgets MUST be keyboard-navigable (arrow keys to move into and past them) so the editor stays accessible.
- The editor degrades gracefully on small screens (mobile <768px): autocomplete shows in a bottom drawer instead of a popover; chips become inline labels instead of widget replacements (smaller tap targets are dangerous on mobile).

## Edge Cases

| Case                                                                   | Behaviour                                                                                                                                       |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| User pastes a 500-line recipe                                          | Editor handles it (CodeMirror is fine to multi-MB documents). Compile may be slow; parent shows spinner.                                        |
| `slug_registry` returns 0 matches for an autocomplete query            | Dropdown shows a "Create new ingredient: `<typed-slug>`" affordance (PRD-115 auto-creates on compile anyway, but the UI nudge confirms intent). |
| User types `@badname` after `@`                                        | Autocomplete shows no match; user can complete with a fallback "Unknown function" highlight on save.                                            |
| Errors prop changes while user is mid-edit                             | Squiggles update on next paint; cursor position preserved.                                                                                      |
| ReadOnly toggled mid-session (e.g. user promoted draft in another tab) | Editor re-renders in read-only mode; in-flight edits in local state are lost (intentional — the version is locked).                             |
| User triggers Recompile but the document has a parse-stopping error    | Recompile shows the parse error inline; the page does NOT save.                                                                                 |
| Chip widget click while in read-only mode                              | Still jumps the cursor; just doesn't move cursor in an editable sense.                                                                          |
| Step body refers to `@99` when only 1-3 indexes exist                  | Chip renders in error state with `UnresolvedStepRefIndex` tooltip after compile.                                                                |

## Acceptance Criteria

Inline per theme protocol.

### Editor component

- [x] `packages/app-food/src/components/DslEditor.tsx` exports `DslEditor` with the props shape above. (120-A: scaffold props — `issues` defers to 120-C.)
- [x] CodeMirror 6 and `@lezer/generator` added as dependencies in `packages/app-food/package.json`.
- [x] Lezer grammar file at `packages/app-food/src/dsl/dsl.grammar`; build script generates the parser into `src/dsl/dsl-parser.ts` (committed for build determinism). Regenerate via `mise food:dsl:generate`. (Filename ends in `-parser.ts` rather than `.grammar.ts` so Vite's import analysis doesn't try to parse the `.grammar` source as JS.)

### Highlighting & parsing parity

- [x] Vitest test loads each of PRD-114's 11 sample recipes (PRD-113 seed not yet merged — uses the in-package sample set), parses each with both the Lezer grammar and PRD-114's parser, and asserts the function-call structure matches (round-trip test catches grammar drift).
- [x] Manual smoke check: opening each sample recipe in the editor shows expected highlighting (functions blue, strings green, numbers orange — exact colors per the @pops/ui theme). (120-F: verified via the `DslEditor.stories.tsx` Storybook entries — `SampleRecipe`, `WithErrors`, `WithProposedSlugs`, `ReadOnly` — which mount the editor with CodeMirror's default highlight style; the recipe-edit page in PRD-119 was the first shell consumer.)

### Autocomplete

- [x] After typing `@`, the suggestion list shows the 6 function names. (120-B: `DSL_FUNCTION_SUGGESTIONS` source — verified in `autocomplete-source.test.ts`.)
- [x] After typing `@ingredient(1, `, the suggestion list queries `food.slugs.search` and shows results. (120-B: descriptor-slug context + `searchSlugs(query, ['ingredient', 'recipe'])`.)
- [x] After typing a known ingredient slug + `:`, the suggestion list shows that ingredient's variants from the DB. (120-B: descriptor-variant context calls `listVariantsForIngredient(slug)` which wraps `food.ingredients.get`.)
- [x] After typing `@ingredient(1, banana:raw:`, the suggestion list shows the 15 curated prep_states. (120-B: descriptor-prep context calls `listPrepStates` which wraps `food.prepStates.list`.)
- [x] Inside a `@step("...")` body, typing `@` shows currently-declared ingredient indexes AND a fuzzy slug search. (120-B: `step-ref` context unions `collectStepIndexes(doc)` with `searchSlugs(query, ['ingredient', 'recipe'])`.)

### Error squiggles

- [x] Passing `issues=[{ severity: 'error', code: 'UnresolvedPrepStateSlug', loc: { startLine: 5, startCol: 12, endLine: 5, endCol: 18 }, message: 'Unknown prep state', slug: 'foobar' }]` renders an underline at exactly that location. (120-C: span resolver in `issues-span.ts` + `Decoration.mark` — verified in `dsl-editor-issues-span.test.ts` and `DslEditor.test.tsx`.)
- [x] Hover on the underline shows the error message. (120-C: `issues-tooltip.ts` renders the message + code + slug into a `data-testid="dsl-editor-issue-tooltip"` DOM tree.)
- [x] `issues` with `severity='info'` render as blue info markers; `severity='error'` render as red squiggles. (120-C: `cm-dsl-issue--info` vs `cm-dsl-issue--error` decoration classes — covered by RTL assertions on `data-dsl-issue-severity`.)

### Chips

- [x] In a step body `@step("Mash the @1 in a bowl")`, the `@1` renders as a chip showing the ingredient name. (120-D: `RefIndexChipWidget` — verified in `DslEditor.test.tsx`.)
- [x] Click on the chip moves the cursor to the matching `@ingredient(1, ...)` line. (120-D: `clickHandler` ViewPlugin + `data-chip-jump-from` attribute — Enter/Space also wired for keyboard activation.)
- [x] `@time(20:min)` renders as a pill labeled "20 min". (120-D: `InlineFuncPillWidget` + `formatPillLabel` — covers `@temperature` as "180 °C" too.)
- [x] On mobile widths, chips render as inline labels (no widget replacement); tap navigation still works. (120-D: compartment-swapped `Decoration.mark` path via `useDslEditorView`'s `matchMedia('(max-width: 767px)')` listener.)

### Reorder & renumber

- [x] "Reorder ingredients" button opens a list of ingredient blocks the user can drag-sort. (120-E: `ReorderIngredientsPanel` driven by `useReorderController`.)
- [x] Confirming the new order rewrites the DSL text, renumbering both `@ingredient(N, ...)` declarations and `@N` step refs in one undoable transaction. (120-E: `applyReorder` builds a single CodeMirror transaction so the change collapses into one undo step.)
- [x] Step refs to slugs (`@banana`) are NOT touched by renumber (they're not index-based). (120-E: only `@N` integer refs are remapped; slug refs are left untouched — covered in `DslEditor.reorder.test.tsx`.)

### Read-only mode

- [x] When `readOnly={true}`, no keystrokes modify the document. (Enforced by `EditorView.editable.of(false)` + `EditorState.readOnly` — verified in the RTL suite via `contentDOM.contenteditable` + `state.readOnly`.)
- [x] Banner is shown at the top.
- [x] Autocomplete and the Recompile button are disabled. (120-F: `buildDslCompletionSource` short-circuits to `null` when `context.state.readOnly` is true, so the popup never opens — verified in the read-only block of `autocomplete-source.test.ts` plus a DOM-level check in `DslEditor.test.tsx`. The Recompile button lives on the recipe-edit page wrapping the editor (PRD-119) and is gated by the same `readOnly` prop.)

### Accessibility & responsive

- [x] Editor passes axe-core's basic checks (no missing labels, no contrast violations). (120-F: `DslEditor.accessibility.test.tsx` sweeps editable + read-only + empty variants with `axe-core.run` and asserts zero violations. The accessible name lives on `.cm-content` via `EditorView.contentAttributes`, where role=textbox expects it.)
- [x] Tab order moves through the editor predictably; chips are reachable by keyboard. (120-D wired Enter/Space activation on chip widgets through `data-chip-jump-from`; 120-F's axe sweep covers the focus-order rule.)
- [x] At 375px width (mobile), the editor remains usable: text doesn't overflow horizontally; autocomplete uses a bottom drawer. (120-F: `dslAutocompleteTheme` ships a `@media (max-width: 767px)` block that pins `.cm-tooltip-autocomplete.dsl-editor-autocomplete` to the viewport floor; the chip widgets compartment already swaps to inline-mark mode on the same breakpoint.)

### Tests

- [x] Vitest + React Testing Library suite at `packages/app-food/src/components/__tests__/DslEditor.test.tsx` covers each acceptance criterion above with a deterministic mock for `food.slugs.search`. (Plus the focused suites in `DslEditor.reorder.test.tsx`, `DslEditor.accessibility.test.tsx`, `dsl-editor/__tests__/autocomplete-source.test.ts`, and the issues-state / issues-span tests.)
- [x] Storybook stories at `packages/app-food/src/components/DslEditor.stories.tsx` cover: empty document, sample recipe, document with errors, document with proposed slugs, read-only. (Discovery glob lives in `apps/pops-storybook/.storybook/main.ts` and picks up `packages/*\/src/**\/*.stories.@(ts|tsx)`, matching the pattern used by every other shared-package story file in this repo. Stories: `Empty`, `SampleRecipe`, `WithErrors`, `WithProposedSlugs`, `Mixed`, `ReadOnly`.)

## Out of Scope

- Compile invocation (parse + resolve + materialise) — handled by **PRD-119** (the page wrapping the editor) which calls `compileRecipeVersion` on save.
- DSL renderer for the read-only cookbook view — **PRD-121**.
- Server-side endpoints for slug search — defined in this PRD's acceptance criteria as `food.slugs.search`; implementation lives in the food backend module when Epic 00 services land.
- Worker-thread parsing for live error feedback — deferred; v1 errors are stale-between-saves only.
- Collaborative editing / multi-cursor — single-user system.
- Vim/Emacs keymaps — defer to CodeMirror's defaults plus what the @pops/shell base config installs.
- Image paste into the editor (for hero images) — handled by PRD-124 via a separate upload affordance on the page, not the editor.
