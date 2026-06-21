/**
 * CodeMirror 6 language extension for the recipe DSL. Wraps the Lezer
 * parser from `./dsl-parser` (generated from `./dsl.grammar`) in an
 * `LRLanguage`, maps node names to highlight tags, and configures language
 * metadata (line comment marker, bracket-matching). Folding for multi-line
 * `@recipe(...)` is supplied by `foldNodeProp`.
 *
 * The Lezer grammar is the source of highlighting truth; the parity test
 * in `__tests__/lezer-parity.test.ts` keeps it aligned with the hand-rolled
 * parser at `parser.ts`.
 */
import {
  LRLanguage,
  LanguageSupport,
  foldInside,
  foldNodeProp,
  indentNodeProp,
} from '@codemirror/language';
import { styleTags, tags as t } from '@lezer/highlight';

import { parser } from './dsl-parser';

/**
 * Style mapping from Lezer node names → highlight tags. CodeMirror's
 * default highlight style turns these into the colours each theme defines.
 * Keep the names in sync with the `nodeNames` block in `dsl-parser.ts`
 * (regenerated via `mise food:dsl:generate`).
 */
const highlight = styleTags({
  FunctionName: t.keyword,
  String: t.string,
  Number: t.number,
  Boolean: t.bool,
  Comment: t.lineComment,
  // Descriptor parts read as variable-like (slugs that resolve to entities).
  // Scope the variable tag to where Identifier appears under a slug-bearing
  // parent so that any future top-level/error-recovery Identifier nodes
  // don't get inadvertently coloured as variables.
  'DescriptorPart/Identifier': t.variableName,
  'Descriptor/Identifier': t.variableName,
  'NamedArg/Identifier': t.propertyName,
  'QtyUnit/Identifier': t.unit,
  SkipMarker: t.null,
  // Punctuation gets a tag so themes can mute it.
  '( )': t.paren,
  ',': t.separator,
  '=': t.definitionOperator,
  ':': t.punctuation,
});

const dslLanguage = LRLanguage.define({
  name: 'recipe-dsl',
  parser: parser.configure({
    props: [
      highlight,
      foldNodeProp.add({
        // Multi-line `@recipe(...)` blocks fold by folding the parenthesised
        // arg list. The `foldInside` helper folds between the first and
        // last child, which for a Call node is the opening and closing
        // paren.
        Call: foldInside,
      }),
      indentNodeProp.add({
        // Continuation lines inside a Call indent one unit past the call's
        // start column.
        Call: (context) => context.column(context.node.from) + context.unit,
      }),
    ],
  }),
  languageData: {
    commentTokens: { line: '//' },
    closeBrackets: { brackets: ['(', '"'] },
  },
});

/**
 * The user-facing extension factory. Pass the result to a CodeMirror
 * EditorState's `extensions` array.
 */
export function recipeDsl(): LanguageSupport {
  return new LanguageSupport(dslLanguage);
}

export { dslLanguage };
