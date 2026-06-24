# Recipe DSL Grammar & Parser

Status: Done — parser ships in `pillars/food/src/dsl/`, exported browser-safe as `@pops/food/dsl` (public.ts) and internally via the DSL barrel (`index.ts`).

A pure text parser for the recipe authoring DSL (grammar in ADR-023). Input: the `body_dsl` string from a `recipe_versions` row. Output: a typed AST (`RecipeAst`) or a list of structured parse errors. No database, no slug lookups, no side effects — same input always yields the same result.

The parser is the front of the recipe pipeline. The resolver (turns AST slugs into entity ids), cycle detector, and compiler (materialises into `recipe_lines` / `recipe_steps`) live alongside it but are separate concerns; splitting them lets the parser be exercised in isolation against the formal grammar without a `FoodDb`.

## Grammar

The parser is hand-rolled (no parser-generator). It is line-oriented at the top level: scan for `@func(...)` blocks, preserve everything else as ordered `markdown` nodes.

```
recipe          := comment* recipe_call yield_call (block | comment | markdown)*
recipe_call     := "@recipe" "(" named_args ")"
yield_call      := "@yield" "(" descriptor "," qty_unit ")"
block           := ingredient_call | step_call | markdown
ingredient_call := "@ingredient" "(" int "," descriptor "," qty_unit ( "," named_arg )* ")"
step_call       := "@step" "(" string ( "," named_arg )* ")"

descriptor      := slug ( ":" slug_or_skip ( ":" slug_or_skip )? )?   -- slug:variant:prep
slug_or_skip    := slug | "_"
slug            := [a-z][a-z0-9-]*
qty_unit        := number ":" unit_slug | "0:none"
number          := -?[0-9]+ ( "." [0-9]+ )?
unit_slug       := [a-z][a-z0-9-]*                                     -- hyphens allowed, e.g. fl-oz

named_arg       := identifier "=" value
identifier      := [a-z_][a-z0-9_]*
value           := string | number | boolean | qty_unit | descriptor

string          := "\"" ( escaped_char | inline_ref | inline_func | char )* "\""
escaped_char    := "\\\"" | "\\\\" | "\\n"                             -- all other backslash seqs are literal
inline_ref      := "@" ( int | slug )
inline_func     := "@time" "(" qty_unit ")" | "@temperature" "(" qty_unit ")"
boolean         := "true" | "false"
markdown        := (any line not starting with "@")*
comment         := "//" .* newline
```

Lexical rules:

- Whitespace between tokens is insignificant; newlines inside `( )` are allowed (multi-line `@recipe(...)`).
- A `@func(...)` block is balanced-paren delimited; the parser handles nested parens inside string args.
- Inline references (`@N` / `@slug` / `@time(...)` / `@temperature(...)`) are valid ONLY inside `@step` string args; anywhere else is a parse error.
- Comments may precede `@recipe`, sit between blocks, or open a line; they are NOT recognised inside `@func(...)` arg lists or inside string literals.
- Compact descriptor `slug:variant:prep`: a trailing `:` is forbidden (`banana:`); use `_` to skip a middle segment (`banana:_:mashed`).

- [x] Hand-rolled parser, no parser-generator dependency; source split across `parser.ts`, `parser-state.ts`, `parser-util.ts`, `parse-recipe.ts` (+ `parse-recipe-assign.ts`), `parse-yield.ts`, `parse-ingredient.ts` (+ `parse-ingredient-named.ts`), `parse-step.ts`, `parse-step-body.ts`, `parse-descriptor.ts`, `cursor.ts`, `lex.ts`, each under the lint line cap.
- [x] The grammar above matches the implementation; round-trip tests prove it (parse → print → parse).

## AST

Drizzle-independent shapes in `ast.ts`. Every node carries an optional `loc: SourceSpan` (1-indexed start/end line+column) for editor diagnostics; the resolver/compiler propagate it into error reports.

```ts
type RecipeAst = { recipe: RecipeHeader; yield: YieldDecl; blocks: AstBlock[] };

type RecipeHeader = {
  slug: string;
  title: string;
  servings?: number;
  prepTime?: QtyUnit;
  cookTime?: QtyUnit;
  recipeType?: RecipeTypeLiteral;
  summary?: string;
};
type RecipeTypeLiteral =
  | 'plate'
  | 'component'
  | 'technique'
  | 'sauce'
  | 'dressing'
  | 'drink'
  | 'condiment';

type YieldDecl = { descriptor: Descriptor; qty: QtyUnit }; // qty=0, unit='none' → non-yielding

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

type Descriptor = { ingredient: string; variant?: string; prep?: string };
type QtyUnit = { qty: number; unit: string };

type StepBodyPart =
  | { kind: 'text'; value: string }
  | { kind: 'ref'; ref: number | string } // @N or @slug
  | { kind: 'time'; qty: QtyUnit }
  | { kind: 'temperature'; qty: QtyUnit };
type StepBody = StepBodyPart[];
```

- [x] `ast.ts` exports `RecipeAst`, `RecipeHeader`, `YieldDecl`, `AstBlock` (`IngredientBlock` / `StepBlock` / `MarkdownBlock`), `Descriptor`, `QtyUnit`, `StepBody`, `StepBodyPart`, `SourceSpan`.

## API

```ts
// parser.ts
export function parseRecipeDsl(input: string): ParseResult;
export type ParseResult = { ok: true; ast: RecipeAst } | { ok: false; errors: ParseError[] };
export type ParseError = { code: ParseErrorCode; message: string; loc: SourceSpan };
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
```

A companion `printRecipeAst(ast): string` (printer.ts) reverses the parse modulo whitespace, always emitting the compact descriptor form. Both `parseRecipeDsl` and the AST/error types are re-exported from the browser-safe `public.ts` (`@pops/food/dsl`) for the CodeMirror editor's lint mapping; the resolver/compile/cycle code is server-only and stays in the internal barrel.

- [x] `parser.ts` exports `parseRecipeDsl(input: string): ParseResult` with the signature above.
- [x] `printer.ts` exports `printRecipeAst`; `public.ts` re-exports the parser + AST + error types with no node/drizzle imports.

## Business rules

- Pure: no I/O, no global state, no randomness.
- Does NOT validate slug existence — `@ingredient(1, made-up-slug, 250:g)` parses fine; resolution fails later.
- Does NOT enforce ingredient-index ordering, but DOES enforce uniqueness within a file (`DuplicateIngredientIndex`).
- Inline `@N` / `@slug` refs in step bodies become AST nodes; their referents are not checked at parse time.
- `@recipe` and `@yield` are each required exactly once. `@recipe` must be the first non-blank, non-comment block; `@yield` follows it (comments / blank lines / markdown may sit between). Missing or duplicate → `MissingRecipeHeader` / `MissingYield` / `UnexpectedToken`.
- Markdown between blocks is preserved as ordered `markdown` nodes so the renderer can reproduce author intent.
- Errors are collected: a malformed `@step` is skipped and parsing continues; only file-scope unbalanced parens short-circuit. One `ParseResult` may carry N errors covering all the bad spots.

- [x] Each of the 13 `ParseErrorCode` values has a test that reliably produces it (`parser-errors.test.ts`), and every `loc.startLine` is asserted to be a positive 1-indexed integer.
- [x] Recovery test: three independent bad `@step` calls yield ≥3 `UnterminatedString` errors and the parser keeps scanning subsequent lines.

## Edge cases

| Case                              | Behaviour                                                |
| --------------------------------- | -------------------------------------------------------- |
| Empty file / `@recipe` not first  | `MissingRecipeHeader` at line 1                          |
| Two `@recipe` blocks              | second → `UnexpectedToken`                               |
| `@step("...` no closing quote     | `UnterminatedString`; skip to next line and recover      |
| Unbalanced parens at file scope   | `UnbalancedParens`; parsing stops                        |
| `// foo` inside a `@step` string  | literal text — `//` is not a comment inside strings      |
| `@ingredient(1, , 250:g)`         | `InvalidArgValue` on the empty slot                      |
| `@time(20:min)` outside a step    | `InlineRefOutsideStep`                                   |
| `@ingredient(1.5, banana, 250:g)` | `InvalidArgValue` — index must be a non-negative integer |
| `@recipe(slug="", title="x")`     | `InvalidSlug`                                            |
| `banana:` (trailing colon)        | `TrailingDescriptorColon`                                |
| `@99` ref to a non-existent index | parses cleanly; resolution raises `UnresolvedRef`        |
| `@func("unknown-name")`           | `UnknownFunction`                                        |

## Tests

- [x] Positive grammar suite (`parser.test.ts`): 11 sample recipes parse cleanly, plus per-feature assertions for header / `recipe_type` / `optional` / markdown ordering / inline `@time`+`@temperature` / multi-line header / comments / named-arg form / compact `_`-skip / `0:none` yield.
- [x] 11 distinct samples (`samples.ts`): simple plate, component with `@yield`, recipe referencing another recipe, optional ingredient, interspersed markdown headings, inline time+temperature, multi-line header, comments, named-arg `@ingredient`, compact `_`-skip descriptor, non-yielding `0:none` technique.
- [x] Round-trip (`parser-roundtrip.test.ts`): every sample's `parse → printRecipeAst → parse` produces a structurally-equal AST (loc stripped).
- [x] Performance: a 200-line generated recipe parses in <50ms (soft assertion; a regression fails this case).

## Out of scope (downstream pipeline)

- Slug resolution against the registry and variant-scope checking — resolver.
- Writing `recipe_lines` / `recipe_steps` — compiler.
- Recipe-graph cycle detection — cycle detector.
- Renderer (AST → cookbook view) and editor/autocomplete — food app.
- Parse-error fix suggestions and cross-step references (`@step3`) — not in v1 (ADR-023).
