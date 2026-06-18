# PRD-114: Recipe DSL Grammar & Parser

> Epic: [00 — Schema & Foundations](../../epics/00-schema-and-foundations.md)

## Overview

Implement the parser for the recipe DSL specified in [ADR-023](../../architecture/adr-023-recipe-markdown-dsl.md). Input: a `body_dsl` string from `recipe_versions.body_dsl` (PRD-107). Output: a typed AST or a structured parse error. This PRD is pure text processing — no database, no slug lookups, no side effects.

The parser is invoked by PRD-115 (Resolver) which turns AST node slugs into real entity IDs. The split lets the parser be exercised in isolation against the formal grammar; the parser's tests don't need a database.

## Formal Grammar

Adapted from ADR-023; this PRD is the authoritative spec for the parser implementation.

```
recipe       := comment* recipe_call yield_call (block | comment | markdown)*

recipe_call  := "@recipe" "(" named_args ")"
yield_call   := "@yield" "(" descriptor "," qty_unit ")"

block        := ingredient_call | step_call | markdown
ingredient_call := "@ingredient" "(" int "," descriptor "," qty_unit ( "," named_arg )* ")"
step_call    := "@step" "(" string ( "," named_arg )* ")"

descriptor   := slug ( ":" slug_or_skip ( ":" slug_or_skip )? )?
slug_or_skip := slug | "_"
slug         := [a-z][a-z0-9-]*

qty_unit     := number ":" unit_slug | "0:none"
number       := -?[0-9]+ ( "." [0-9]+ )?
unit_slug    := [a-z][a-z0-9-]*       -- hyphens allowed (e.g. `fl-oz`)

named_args   := named_arg ( "," named_arg )*
named_arg    := identifier "=" value
identifier   := [a-z_][a-z0-9_]*
value        := string | number | boolean | qty_unit | descriptor

string       := "\"" string_body "\""
string_body  := ( escaped_char | inline_ref | inline_func | char )*
escaped_char := "\\\"" | "\\\\" | "\\n"
inline_ref   := "@" ( int | slug )
inline_func  := "@time" "(" qty_unit ")" | "@temperature" "(" qty_unit ")"
boolean      := "true" | "false"

markdown     := (any line not starting with "@")*
comment      := "//" .* newline
```

### Lexical notes

- Whitespace between tokens is insignificant. Newlines inside `(` `)` are allowed (multi-line `@recipe(...)` calls).
- The parser is line-oriented at the top level: it scans for `@func(...)` blocks; everything else is preserved as `markdown` nodes in order.
- A `@func(...)` block is balanced-paren delimited. The parser must handle nested parens (e.g. inside string args containing inline calls).
- String escapes: `\"`, `\\`, `\n`. All other backslash sequences are literal characters.
- Inline references (`@N` / `@slug` / `@time(...)` / `@temperature(...)`) appear ONLY inside `@step` string args. Outside step strings they are syntax errors at the parser level.
- Comments may appear before `@recipe`, between blocks, or inline at start of line. Comments inside `@func(...)` arg lists are NOT supported.
- Compact descriptor `slug:variant:prep` segments: trailing `:` is forbidden (`banana:` is invalid). Use `_` to skip a middle segment: `banana:_:mashed`.

## AST Shape

TypeScript shape (Drizzle-independent types in `packages/app-food/src/dsl/ast.ts`):

```ts
type RecipeAst = {
  recipe: RecipeHeader;
  yield: YieldDecl;
  blocks: AstBlock[]; // ordered: ingredient | step | markdown
};

type RecipeHeader = {
  slug: string;
  title: string;
  servings?: number;
  prepTime?: QtyUnit;
  cookTime?: QtyUnit;
  recipeType?: RecipeTypeLiteral;
  summary?: string;
};

type YieldDecl = {
  descriptor: Descriptor;
  qty: QtyUnit; // qty=0, unit='none' for non-yielding
};

type AstBlock =
  | {
      kind: 'ingredient';
      index: number;
      descriptor: Descriptor;
      qty: QtyUnit;
      optional?: boolean;
      notes?: string;
    }
  | { kind: 'step'; body: StepBody; duration?: QtyUnit; temperature?: QtyUnit }
  | { kind: 'markdown'; text: string };

type Descriptor = {
  ingredient: string; // slug
  variant?: string; // slug, scoped under ingredient (PRD-106)
  prep?: string; // slug
};

type QtyUnit = { qty: number; unit: string };

type StepBody = StepBodyPart[];
type StepBodyPart =
  | { kind: 'text'; value: string }
  | { kind: 'ref'; ref: number | string } // @N or @slug
  | { kind: 'time'; qty: QtyUnit }
  | { kind: 'temperature'; qty: QtyUnit };
```

Source positions for every node (line, column, end-line, end-column) are attached to support precise error messages in the editor — included as `loc?: SourceSpan` on every AST node. Editor consumers ignore `loc`; compile/resolution code (PRD-115/116) propagates it through error reports.

## Parser API

```ts
// packages/app-food/src/dsl/parser.ts
export function parseRecipeDsl(input: string): ParseResult;

export type ParseResult = { ok: true; ast: RecipeAst } | { ok: false; errors: ParseError[] };

export type ParseError = {
  code: ParseErrorCode;
  message: string; // human-readable
  loc: SourceSpan; // where in the input
};

export type ParseErrorCode =
  | 'MissingRecipeHeader'
  | 'MissingYield'
  | 'DuplicateIngredientIndex'
  | 'UnknownFunction'
  | 'InvalidArgCount'
  | 'InvalidArgValue'
  | 'UnbalancedParens'
  | 'UnterminatedString'
  | 'InvalidSlug'
  | 'InvalidQtyUnit'
  | 'InlineRefOutsideStep'
  | 'TrailingDescriptorColon'
  | 'UnexpectedToken';

export type SourceSpan = {
  startLine: number; // 1-indexed
  startCol: number; // 1-indexed
  endLine: number;
  endCol: number;
};
```

Parsing collects ALL errors that don't prevent further parsing (e.g. a broken `@step` doesn't stop the rest of the file). Errors that prevent recovery (unbalanced parens at file scope) short-circuit. Worst case: a single ParseResult contains N errors covering all the bad bits.

## Business Rules

- The parser is **pure** — same input always returns the same result. No I/O, no global state, no random.
- The parser does NOT validate slug existence (that's PRD-115's job). `@ingredient(1, made-up-slug, 250:g)` parses successfully; resolution fails.
- The parser does NOT enforce ingredient index ordering — `@ingredient(3, ...)` followed by `@ingredient(1, ...)` parses. But it DOES enforce uniqueness within the file (`DuplicateIngredientIndex`).
- Inline `@N` / `@slug` references in step bodies are parsed as AST nodes but their referents are not checked at parse time. PRD-115 resolves them.
- `@recipe` and `@yield` are required to appear exactly once. `@recipe` must be the first non-blank, non-comment line; `@yield` must follow it (allowing comments / blank lines / markdown between). Missing or duplicate → `MissingRecipeHeader`, `MissingYield`, `UnexpectedToken`.
- Markdown content between blocks is preserved as-ordered `markdown` AST nodes so the renderer can faithfully reproduce author intent.
- Whitespace inside multi-line `@func(...)` arg lists is normalised: the parser doesn't preserve indentation of args, only the values.

## Edge Cases

| Case                                                     | Behaviour                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Empty file                                               | `MissingRecipeHeader` at line 1                                                            |
| `@recipe` not first                                      | `MissingRecipeHeader` at line 1; subsequent `@recipe` may also raise `UnexpectedToken`     |
| Two `@recipe` blocks                                     | Second raises `UnexpectedToken` with code-pointer to the duplicate                         |
| `@step("...` with no closing quote                       | `UnterminatedString` at the opening quote location; parser skips to next line and recovers |
| Unbalanced parens at file scope                          | `UnbalancedParens` and parsing stops at that point                                         |
| Comment inside `@step("// foo")`                         | Comment is literal text inside the string. `//` is NOT a comment inside string args.       |
| `@ingredient(1, , 250:g)` (missing descriptor)           | `InvalidArgValue` on the empty positional slot                                             |
| `@time(20:min)` outside a `@step` body                   | `InlineRefOutsideStep`                                                                     |
| `@ingredient(1.5, banana, 250:g)` (non-integer index)    | `InvalidArgValue` — index must be a non-negative integer                                   |
| Two `@ingredient` blocks with same index                 | `DuplicateIngredientIndex` on the second                                                   |
| `@recipe(slug="", title="x")` (empty slug)               | `InvalidSlug`                                                                              |
| Step body referring to `@99` when only indexes 1-3 exist | Parses cleanly; PRD-115 raises `UnresolvedRef` during resolution                           |
| String containing `@ingredient(...)` inline              | Inline `@ingredient` is not a permitted inline_func; `InlineRefOutsideStep`                |
| `@func("unknown-name")`                                  | `UnknownFunction`                                                                          |

## Acceptance Criteria

Inline per theme protocol.

### Implementation

- [x] `packages/app-food/src/dsl/ast.ts` exports the AST types (RecipeAst, RecipeHeader, YieldDecl, AstBlock, Descriptor, QtyUnit, StepBody, StepBodyPart, SourceSpan).
- [x] `packages/app-food/src/dsl/parser.ts` exports `parseRecipeDsl(input: string): ParseResult` matching the signature.
- [x] Parser is hand-rolled — no parser-generator dependency. Source split across `parser.ts`, `parser-state.ts`, `parser-util.ts`, `parse-recipe.ts` (+ `parse-recipe-assign.ts`), `parse-yield.ts`, `parse-ingredient.ts` (+ `parse-ingredient-named.ts`), `parse-step.ts`, `parse-step-body.ts`, `parse-descriptor.ts`, `cursor.ts`, `lex.ts`. Each file <200 lines under the repo lint cap.
- [x] Parser is pure: same input → same output, no I/O, no DB.

### Grammar coverage tests

- [x] Vitest suite at `packages/app-food/src/dsl/__tests__/parser.test.ts` — 12 positive cases against every sample, plus per-feature assertions for header / recipe_type / optional / markdown ordering / inline time+temperature / multi-line header / comments / named form / compact-skip / 0:none yield.
- [x] Round-trip tests in `parser-roundtrip.test.ts`: every sample's `parse → printRecipeAst → parse` produces a structurally-equal AST (loc stripped). `printRecipeAst` exported from `packages/app-food/src/dsl/printer.ts`.
- [x] 11 distinct sample recipes in `__tests__/samples.ts` covering: simple plate, component with `@yield`, recipe referencing another recipe in `@ingredient`, recipe with optional ingredient, recipe with markdown headings interspersed, recipe with inline `@time` and `@temperature`, recipe with multi-line `@recipe(...)` header, recipe with comments, recipe with named-arg `@ingredient` form, recipe with compact `_`-skipped descriptor, non-yielding `0:none` technique.

### Error coverage tests

- [x] Each of the 13 `ParseErrorCode` values has at least one test case that reliably produces it, asserting the code; each error's `loc.startLine` is a positive integer (separate assertion verifies the format across multiple errors).
- [x] Error recovery test: an input with three independent bad `@step` calls produces a `ParseResult` with three `UnterminatedString` errors, and the parser recovers to keep scanning subsequent lines (verified by `recovery: 3 bad @step calls produce 3 errors` test).

### Performance

- [x] Parsing a 200-line recipe (the generated benchmark in `parser-roundtrip.test.ts`) completes in <50ms on the dev laptop. Soft assertion; a regression will fail this single case.

### Documentation

- [x] The grammar block in this PRD matches the parser implementation.
- [x] PRD-115 cross-link remains in Out of Scope — resolution is downstream.

## Out of Scope

- Slug resolution against `slug_registry` — **PRD-115**.
- Variant scope checking (variant slug `raw` valid under `banana` but not under `apple`) — **PRD-115**.
- Writing to `recipe_lines` or `recipe_steps` — **PRD-116**.
- Recipe-graph cycle detection — **PRD-117**.
- Renderer that turns AST back into pretty cookbook view — Epic 01 PRD.
- Editor / autocomplete — Epic 01 PRD.
- Suggestion of fixes for parse errors — deferred.
- Inline reference to other steps (`@step3`) — not in v1 grammar (ADR-023).
