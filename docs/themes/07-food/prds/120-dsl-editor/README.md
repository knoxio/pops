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
  errors?: ParseError[] | ResolveError[]; // from PRD-114/115; rendered as squiggles
  proposedSlugs?: ProposedSlug[]; // from PRD-115; rendered as info markers
  readOnly?: boolean; // true for `current` versions (PRD-107 forbids edit)
  className?: string;
};

export function DslEditor(props: DslEditorProps): JSX.Element;
```

`onChange` fires on every change, debounced internally to 250ms to keep autocomplete responsive without thrashing parent state. The page is responsible for storing the value, calling save, and feeding back errors from the most recent compile.

`errors` and `proposedSlugs` use the SourceSpan from PRD-114 to position the squiggle / marker. The editor doesn't run the parser itself — it consumes whatever the parent supplies.

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

- [ ] `packages/app-food/src/components/DslEditor.tsx` exports `DslEditor` with the props shape above.
- [ ] CodeMirror 6 and `@lezer/generator` added as dependencies in `packages/app-food/package.json`.
- [ ] Lezer grammar file at `packages/app-food/src/dsl/dsl.grammar`; build script generates the parser into `src/dsl/dsl.grammar.ts` (gitignored or committed — choose at impl; recommend committed for build determinism).

### Highlighting & parsing parity

- [ ] Vitest test loads each of PRD-113's 5 sample recipes, parses each with both the Lezer grammar and PRD-114's parser, and asserts the function-call structure matches (round-trip test catches grammar drift).
- [ ] Manual smoke check: opening each sample recipe in the editor shows expected highlighting (functions blue, strings green, numbers orange — exact colors per the @pops/ui theme).

### Autocomplete

- [ ] After typing `@`, the suggestion list shows the 6 function names.
- [ ] After typing `@ingredient(1, `, the suggestion list queries `food.slugs.search` and shows results.
- [ ] After typing a known ingredient slug + `:`, the suggestion list shows that ingredient's variants from the DB.
- [ ] After typing `@ingredient(1, banana:raw:`, the suggestion list shows the 15 curated prep_states.
- [ ] Inside a `@step("...")` body, typing `@` shows currently-declared ingredient indexes AND a fuzzy slug search.

### Error squiggles

- [ ] Passing `errors=[{ code: 'UnresolvedPrepStateSlug', loc: { startLine: 5, startCol: 12, endLine: 5, endCol: 18 }, message: 'Unknown prep state', slug: 'foobar' }]` renders an underline at exactly that location.
- [ ] Hover on the underline shows the error message.
- [ ] `proposedSlugs` render as info markers (blue) distinct from errors (red).

### Chips

- [ ] In a step body `@step("Mash the @1 in a bowl")`, the `@1` renders as a chip showing the ingredient name.
- [ ] Click on the chip moves the cursor to the matching `@ingredient(1, ...)` line.
- [ ] `@time(20:min)` renders as a pill labeled "20 min".
- [ ] On mobile widths, chips render as inline labels (no widget replacement); tap navigation still works.

### Reorder & renumber

- [ ] "Reorder ingredients" button opens a list of ingredient blocks the user can drag-sort.
- [ ] Confirming the new order rewrites the DSL text, renumbering both `@ingredient(N, ...)` declarations and `@N` step refs in one undoable transaction.
- [ ] Step refs to slugs (`@banana`) are NOT touched by renumber (they're not index-based).

### Read-only mode

- [ ] When `readOnly={true}`, no keystrokes modify the document.
- [ ] Banner is shown at the top.
- [ ] Autocomplete and the Recompile button are disabled.

### Accessibility & responsive

- [ ] Editor passes axe-core's basic checks (no missing labels, no contrast violations).
- [ ] Tab order moves through the editor predictably; chips are reachable by keyboard.
- [ ] At 375px width (mobile), the editor remains usable: text doesn't overflow horizontally; autocomplete uses a bottom drawer.

### Tests

- [ ] Vitest + React Testing Library suite at `packages/app-food/src/components/__tests__/DslEditor.test.tsx` covers each acceptance criterion above with a deterministic mock for `food.slugs.search`.
- [ ] Storybook stories at `apps/pops-storybook/src/stories/food/DslEditor.stories.tsx` cover: empty document, sample recipe, document with errors, document with proposed slugs, read-only.

## Out of Scope

- Compile invocation (parse + resolve + materialise) — handled by **PRD-119** (the page wrapping the editor) which calls `compileRecipeVersion` on save.
- DSL renderer for the read-only cookbook view — **PRD-121**.
- Server-side endpoints for slug search — defined in this PRD's acceptance criteria as `food.slugs.search`; implementation lives in the food backend module when Epic 00 services land.
- Worker-thread parsing for live error feedback — deferred; v1 errors are stale-between-saves only.
- Collaborative editing / multi-cursor — single-user system.
- Vim/Emacs keymaps — defer to CodeMirror's defaults plus what the @pops/shell base config installs.
- Image paste into the editor (for hero images) — handled by PRD-124 via a separate upload affordance on the page, not the editor.
