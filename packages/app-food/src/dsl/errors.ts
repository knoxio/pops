/**
 * The parser collects every recoverable error (e.g. a malformed `@step` is
 * skipped and parsing continues at the next line). Non-recoverable errors
 * (unbalanced parens at file scope) short-circuit.
 */
import type { SourceSpan } from './ast.js';

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

export interface ParseError {
  code: ParseErrorCode;
  message: string;
  loc: SourceSpan;
}
