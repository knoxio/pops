# ADR-023: Recipe Markdown DSL

## Status

Accepted — 2026-06-07

## Context

Theme 07 (Food) needs a canonical storage format for recipe instructions that:

1. Is human-readable as plain text (the cookbook-feel principle from the theme).
2. Encodes structural references — which step uses which ingredient — without ambiguity, so a "cooking mode" UI can highlight ingredients per step and run per-step timers.
3. Is LLM-friendly for ingest (PRDs 114–117 cover parse → resolve → materialise → cycle-check; Epic 02 PRDs cover the actual LLM extraction calls): a model parsing an Instagram caption or screenshot can emit the format directly, or emit structured JSON that we translate to the format.
4. Is editable in the pops shell without forcing the user to type complex markup, while still being a flat text file under the hood.
5. Resolves canonical ingredient references (the chuck → patty → burger model from [ADR-022](./adr-022-unified-recipe-ingredient-model.md)) — a recipe line should bind to a specific `ingredient_id` or `variant_id`, not a free-text string that might mean different things in different recipes.

Plain markdown fails (3) and (5): "1 cup of diced onion" is unstructured text. A JSON document fails (1), (2 partially), and (4): humans don't author JSON willingly. A markdown body plus a parallel structured representation doubles the storage and creates sync hazards.

## Options Considered

| Option                                                       | Pros                                                                                                              | Cons                                                                                                      |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Plain markdown body, free-text ingredients**               | Trivially readable and writable; zero parser                                                                      | No structural refs; no per-step timers; ingredient resolution is fuzzy text matching forever              |
| **Structured JSON (or YAML) recipe documents**               | Easy to query; easy for LLMs to emit; unambiguous refs                                                            | Author-hostile; markdown editor doesn't apply; humans read the rendered form, not the source              |
| **Markdown body + parallel structured fields**               | Both shapes preserved                                                                                             | Two sources of truth; drift inevitable; double the storage                                                |
| **Markdown with embedded function calls (the DSL, chosen)**  | Readable as text; structural refs explicit; one canonical form; LLM can emit it; renderer makes the chrome pretty | Custom parser to maintain; editor needs DSL-aware affordances; LLM ingest needs the grammar in its prompt |
| **YAML frontmatter + markdown body (Cerebrum engram style)** | Familiar shape; works for tagging/headers                                                                         | Body remains unstructured; doesn't solve per-step ingredient refs                                         |

## Decision

Adopt a custom DSL: markdown with embedded `@func(...)` calls for structured elements. The DSL is the canonical storage format on `recipe_versions.body_dsl`. Derived tables (`recipe_lines`, `recipe_steps`) are compiled from the DSL on save and act as a queryable index — they can be rebuilt from the DSL at any time, the DSL is never reconstructed from them.

### Grammar

```
@recipe(
  slug="cooked-bananas",
  title="Cooked Bananas",
  servings=2,
  prep_time=0:min,
  cook_time=30:min,
  recipe_type="component"
)

@yield(cooked-banana, 1:count)

## Ingredients
@ingredient(1, banana:raw:mashed, 250:g)
@ingredient(2, butter, 10:g, optional=true)
@ingredient(3, smash-patty, 4:count)

## Steps
@step("Mash the @1 in a bowl.")
@step("Melt the @2 in a pan over medium heat for @time(2:min).")
@step("Add the @1 and cook for @time(20:min), stirring occasionally.")
```

### Functions

| Function       | Position    | Args                                                                                                                                                                                       | Notes                                                                                                                                     |
| -------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `@recipe`      | Block, once | Named only: `slug`, `title`, `servings`, `prep_time`, `cook_time`, `recipe_type?`, `summary?`                                                                                              | Must be the first non-blank line. `recipe_type` defaults to `"plate"`.                                                                    |
| `@yield`       | Block, once | Positional: `(ingredient_slug, qty:unit)`                                                                                                                                                  | Required. Output ingredient must exist in slug_registry. Setting `qty:unit` to `0:none` is allowed for non-yielding recipes (techniques). |
| `@ingredient`  | Block, N    | Positional + named. Compact: `(index, slug[:variant[:prep]], qty:unit, optional?=false, notes?=...)`. Named alternative: `(index, slug, variant=, prep=, qty=, unit=, optional=, notes=)`. | Index is an integer ≥1, unique within the recipe. Compact and named forms compile to the same tuple.                                      |
| `@step`        | Block, N    | Positional: one quoted string (the step body), then optional named args (`duration?=N:unit`, `temperature?=N:unit`)                                                                        | Step body is markdown text that may contain inline `@N`, `@slug`, `@time(...)`, `@temperature(...)`.                                      |
| `@time`        | Inline only | Positional: `(qty:unit)`                                                                                                                                                                   | Inline only inside `@step` bodies. Renderer turns into a clickable/tappable timer.                                                        |
| `@temperature` | Inline only | Positional: `(qty:unit)`                                                                                                                                                                   | Inline only; renderer prints with unit-appropriate symbol (°C, °F, gas mark).                                                             |

Reserved function names: `@recipe`, `@yield`, `@ingredient`, `@step`, `@time`, `@temperature`. Extensible later (`@note`, `@variant`, `@tip`) without breaking existing recipes.

### Lexical rules

- `@func(...)` matches `@` + identifier + balanced parens. Parens may contain nested `@func(...)` calls and quoted strings.
- String args are double-quoted. Quotes inside strings escape with `\"`.
- The compact descriptor `slug:variant:prep` is a single positional token. Each segment is a slug; missing trailing segments are omitted (so `banana` is just an ingredient, `banana:raw` is ingredient + variant, `banana:raw:mashed` is all three). Use `_` to skip a middle segment when needed: `banana:_:mashed` means default variant + mashed prep.
- The compact quantity `qty:unit` is a single positional token. Numeric `qty`; `unit` is a unit slug.
- Named args use `key=value`. Value may be quoted string, number, boolean, or `qty:unit` token.
- References inside step bodies: `@N` resolves to the ingredient with `index=N` in this recipe; `@slug` resolves via the slug_registry (`ingredient-model`).
- Markdown headings, paragraphs, and other markdown syntax outside `@func(...)` blocks are visual chrome only — they are preserved in the stored DSL and rendered, but ignored by the structural compiler.
- Comments: `// ...` at start of line. Stripped during compile.

### Resolution

At save time, the compiler:

1. Parses the DSL into an AST.
2. Validates: `@recipe` is present and first; `@yield` is present; every `@ingredient` has a unique index; every `@N` or `@slug` reference resolves; quantities parse; units exist.
3. Looks up each ingredient slug in the slug_registry (`ingredient-model`). If a slug is unknown, the compile records it as a `proposed_slug` (Epic 03 review flow surfaces these for user approval — they do not block save when the recipe is `draft`; they DO block promotion from `draft` to `current`).
4. Resolves variant scoped to ingredient (variant slug `raw` under ingredient `banana` is distinct from `raw` under `apple`).
5. Materializes `recipe_lines` and `recipe_steps` rows for this `recipe_version`.

The DSL source is canonical. Compile output is an index. A failed compile saves the raw DSL and a `compile_error` field on the version; the recipe is unusable from the planner/solver until compile succeeds.

### File extension

The canonical file extension for serialised DSL content is `.recipe`. The extension is a convention only — recipes are stored in SQLite (`recipe_versions.body_dsl` per `recipe-model`), not as files on disk. The extension applies on:

- Export: when a recipe is serialised to a single file (sharing, backup, hand-off), the file is `<slug>.recipe`.
- Import: a file ending in `.recipe` is dispatched to the DSL parser without further sniffing.
- Editor hinting: pops-shell's DSL editor (and any external editor with appropriate language support) keys off the extension to load the DSL grammar / autocomplete.

If the storage model is later promoted to "recipes are files on disk" (the Cerebrum-engram pattern per [ADR-019](../../../cerebrum/docs/architecture/adr-019-engram-storage-model.md)), the extension is already in place and the SQLite tables become a regeneratable index. That promotion is a separate ADR; this ADR commits only to the extension convention.

### Renderer

The renderer is out of scope for this ADR (lives in `recipe-model` + an Epic 01 PRD), but the rule for ADR purposes: every `@func(...)` becomes a styled block or inline element. Authors never read the raw DSL except in an explicit "source view" — the editor and view always render to the cookbook-style form.

## Consequences

### Positive

- One canonical storage format; no sync-between-shapes risk.
- Structural refs (`@N` / `@slug`) unblock per-step timers, ingredient highlighting in cooking mode, and dependency analysis ("which recipes use this ingredient?").
- LLM ingest path can emit named-arg form (easier to generate correctly); human author path uses compact form. Both compile to the same tuple.
- Recipe-as-ingredient (ADR-022) works naturally: `@ingredient(3, smash-patty, 4:count)` is one syntax for both raw ingredients and recipe outputs — the resolver figures out which.
- DSL is a text file. Backups, diffs, version history, git all work the same as for markdown.
- The grammar is small enough to ship a hand-rolled parser without a parser-generator.

### Negative

- Custom parser to maintain. Bugs in the parser look like data corruption.
- Editor needs autocomplete / chip rendering for refs to be pleasant; without it, hand-typing is annoying.
- LLM ingest prompts have to include the grammar. Token cost is small (the grammar is ~30 lines) but non-zero per ingest call.
- Compile errors block recipe usability — needs a clear error UI (Epic 01 PRD).
- The two-syntax-for-ingredient (compact vs named) doubles parser test surface. Acceptable because both forms have load-bearing reasons (human vs LLM).

### Neutral

- Slug uniqueness is enforced by the `slug_registry` table (`ingredient-model` amendment) so refs in the DSL are unambiguous.
- Variants stay scoped under their parent ingredient — variants do not appear in the global slug namespace.
- Step-to-step references (`@step3`) are deferred. Not in v1 grammar.

## References

- [ADR-022](./adr-022-unified-recipe-ingredient-model.md) — recipes-as-ingredients (the basis for `@ingredient(N, recipe-slug, qty:unit)` syntax)
- [`ingredient-model`](../prds/ingredient-model.md) — slug_registry table (amended as part of this ADR)
- `recipe-model` — Recipe & Version Model (stores `body_dsl`, materializes `recipe_lines` and `recipe_steps`)
- Future PRD in Epic 01 — DSL-aware editor with autocomplete and chip rendering
