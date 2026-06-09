import { readIdentifier, readQtyUnit, readString } from './lex.js';
import { parseStepBody } from './parse-step-body.js';

/**
 * `@step(...)` parser. Positional: one quoted string (the body). Then
 * optional named args `duration=qty:unit` and `temperature=qty:unit`. The
 * body string is parsed for inline `@N`, `@slug`, `@time(...)`,
 * `@temperature(...)` via `parseStepBody`.
 */
import type { QtyUnit, StepBlock } from './ast.js';
import type { Cursor } from './cursor.js';
import type { ParseError } from './errors.js';

export function parseStepArgs(c: Cursor, errors: ParseError[]): StepBlock | null {
  c.skipWhitespace();
  const bodyMark = c.mark();
  if (c.peek() !== '"') {
    errors.push({
      code: 'InvalidArgValue',
      message: '@step body must be a quoted string',
      loc: c.spanFrom(bodyMark),
    });
    return null;
  }
  const s = readString(c);
  if (s === null || !s.terminated) {
    errors.push({
      code: 'UnterminatedString',
      message: '@step body string was not terminated',
      loc: c.spanFrom(bodyMark),
    });
    return null;
  }
  const block: StepBlock = {
    kind: 'step',
    body: parseStepBody(s.value, () => {
      errors.push({
        code: 'InlineRefOutsideStep',
        message: 'Inline @func() other than @time / @temperature is not allowed in a step body',
        loc: c.spanFrom(bodyMark),
      });
    }),
  };

  c.skipWhitespace();
  while (!c.eof() && c.peek() === ',') {
    c.advance();
    c.skipWhitespace();
    if (c.peek() === ')') break;
    if (!readNamedArg(c, errors, block)) return null;
    c.skipWhitespace();
  }
  return block;
}

function readNamedArg(c: Cursor, errors: ParseError[], block: StepBlock): boolean {
  const keyMark = c.mark();
  const key = readIdentifier(c);
  if (key === null) {
    errors.push({
      code: 'InvalidArgValue',
      message: 'Expected named arg key after @step body',
      loc: c.spanFrom(keyMark),
    });
    return false;
  }
  c.skipWhitespace();
  if (c.peek() !== '=') {
    errors.push({
      code: 'InvalidArgValue',
      message: `Expected "=" after "${key}"`,
      loc: c.pointSpan(),
    });
    return false;
  }
  c.advance();
  c.skipWhitespace();
  if (key !== 'duration' && key !== 'temperature') {
    errors.push({
      code: 'UnknownFunction',
      message: `Unknown @step named arg "${key}"`,
      loc: c.spanFrom(keyMark),
    });
    // Skip value to recover.
    while (!c.eof() && c.peek() !== ',' && c.peek() !== ')') c.advance();
    return true;
  }
  const qu: QtyUnit | null = readQtyUnit(c);
  if (qu === null) {
    errors.push({
      code: 'InvalidQtyUnit',
      message: `Expected qty:unit for @step ${key}`,
      loc: c.pointSpan(),
    });
    return false;
  }
  if (key === 'duration') block.duration = qu;
  else block.temperature = qu;
  return true;
}
