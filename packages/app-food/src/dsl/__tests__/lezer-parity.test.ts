/**
 * Lezer-vs-parser parity test — PRD-120 part A acceptance criterion.
 *
 * The hand-rolled parser at `../parser.ts` is the canonical spec
 * (PRD-114 / ADR-023). The Lezer grammar at `../dsl.grammar` exists only
 * to drive CodeMirror highlighting. If they ever diverge, the editor will
 * colourise content that the runtime parser rejects (or vice versa) and
 * authors will see misleading visual cues.
 *
 * This suite walks each PRD-114 sample recipe through BOTH parsers and
 * asserts the top-level function-call sequence matches by name and arity.
 * It deliberately does NOT compare full AST shapes — the Lezer grammar is
 * permissive and doesn't validate semantics; the parity contract is
 * "calls land in the same order with the same names".
 */
import { describe, expect, it } from 'vitest';

import { parseRecipeDsl } from '@pops/food/dsl';

import { parser as lezerParser } from '../dsl-parser';
import { ALL_SAMPLES } from './samples';

import type { SyntaxNode, Tree } from '@lezer/common';

import type { RecipeAst } from '@pops/food/dsl';

interface CallSignature {
  name: string;
  /**
   * Number of top-level args. We use this as a sanity-check that grammar
   * drift doesn't silently absorb a missing comma into a permissive arg
   * rule. Counted differently on each side because the AST has already
   * collapsed compact vs named forms, but the underlying call-site arg
   * count is observable: it's exactly the number of commas + 1 in the
   * parenthesised body (or 0 when the body is empty), which both
   * parsers see.
   */
  argCount: number;
}

function lezerCallSignatures(input: string): CallSignature[] {
  const tree: Tree = lezerParser.parse(input);
  const signatures: CallSignature[] = [];
  // Walk the tree via SyntaxNode pointers — `tree.iterate`'s callback
  // gives a TreeCursor view that doesn't expose `.getChild`, so we
  // descend manually from the top node and collect at the Call level.
  collectCalls(tree.topNode, input, signatures);
  return signatures;
}

function collectCalls(node: SyntaxNode, input: string, out: CallSignature[]): void {
  for (let child = node.firstChild; child !== null; child = child.nextSibling) {
    if (child.name === 'Call') {
      out.push(extractCallSignature(child, input));
      // No nested Calls at this stratum — step-body inline refs live
      // inside the String token, not as child Call nodes.
    } else {
      collectCalls(child, input, out);
    }
  }
}

function extractCallSignature(node: SyntaxNode, input: string): CallSignature {
  const nameNode = node.getChild('FunctionName');
  const argList = node.getChild('ArgList');
  const name = nameNode === null ? '' : input.slice(nameNode.from + 1, nameNode.to);
  const argCount = argList === null ? 0 : countArgs(argList);
  return { name, argCount };
}

function countArgs(argList: SyntaxNode): number {
  let count = 0;
  for (let child = argList.firstChild; child !== null; child = child.nextSibling) {
    if (child.name === 'Arg') count += 1;
  }
  return count;
}

function parserCallSignatures(input: string, ast: RecipeAst): CallSignature[] {
  // We sweep the source text directly for arg counts — the AST loses the
  // distinction between compact (`@ingredient(1, x, 1:g)`) and named
  // (`@ingredient(1, x, qty=1, unit=g)`) forms after parsing, but the
  // raw paren content carries that information unambiguously. The AST
  // gives us the sequence of call kinds; the source gives the counts.
  const callKinds = derivedCallKinds(ast);
  const sourceCalls = sourceCallSpans(input);
  if (callKinds.length !== sourceCalls.length) {
    throw new Error(
      `Internal parity-test mismatch: AST has ${callKinds.length} calls but source has ${sourceCalls.length}`
    );
  }
  return callKinds.map((name, i) => ({ name, argCount: countSourceArgs(input, sourceCalls[i]!) }));
}

function derivedCallKinds(ast: RecipeAst): string[] {
  const kinds: string[] = ['recipe', 'yield'];
  for (const block of ast.blocks) {
    if (block.kind === 'ingredient') kinds.push('ingredient');
    else if (block.kind === 'step') kinds.push('step');
    // markdown blocks have no call signature
  }
  return kinds;
}

interface CallSpan {
  /** Position of the `(` after the function name. */
  openParen: number;
  /** Position of the matching `)`. */
  closeParen: number;
}

function sourceCallSpans(input: string): CallSpan[] {
  const spans: CallSpan[] = [];
  // Match `@name(` starting at a non-inline position. Inline `@time(...)`
  // and `@temperature(...)` calls live inside step body strings, which
  // we skip because the lexer treats the whole string as one token.
  const callPattern = /@(recipe|yield|ingredient|step)\s*\(/g;
  for (const match of input.matchAll(callPattern)) {
    if (match.index === undefined) continue;
    if (insideStringAt(input, match.index)) continue;
    const open = match.index + match[0].length - 1;
    const close = matchParen(input, open);
    spans.push({ openParen: open, closeParen: close });
  }
  return spans;
}

function insideStringAt(input: string, pos: number): boolean {
  let inString = false;
  for (let i = 0; i < pos; i += 1) {
    const ch = input[i];
    if (ch === '\\' && inString) {
      i += 1;
      continue;
    }
    if (ch === '"') inString = !inString;
  }
  return inString;
}

function matchParen(input: string, openIdx: number): number {
  let depth = 0;
  let inString = false;
  for (let i = openIdx; i < input.length; i += 1) {
    const ch = input[i];
    if (ch === '\\' && inString) {
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error(`Unbalanced parens starting at ${openIdx}`);
}

function countSourceArgs(input: string, span: CallSpan): number {
  const body = input.slice(span.openParen + 1, span.closeParen).trim();
  if (body.length === 0) return 0;
  // Count top-level commas — depth-aware so nested `@time(N:unit)` inside
  // string args (and the `:` separator in qty:unit) don't add to the count.
  let depth = 0;
  let inString = false;
  let commas = 0;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (ch === '\\' && inString) {
      i += 1;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '(') depth += 1;
    else if (ch === ')') depth -= 1;
    else if (ch === ',' && depth === 0) commas += 1;
  }
  return commas + 1;
}

describe('PRD-120 — Lezer ↔ parser parity', () => {
  for (const [label, source] of ALL_SAMPLES) {
    it(`matches call signature on sample "${label}"`, () => {
      const result = parseRecipeDsl(source);
      if (!result.ok) {
        throw new Error(
          `Parser failed on sample: ${result.errors.map((e) => `${e.code}@${e.loc.startLine}`).join(', ')}`
        );
      }
      const fromLezer = lezerCallSignatures(source);
      const fromParser = parserCallSignatures(source, result.ast);
      // Compare the full signature (name + argCount) so grammar drift that
      // changes how arguments are split — e.g. a missing comma absorbed by
      // a permissive arg rule — also trips the test, not just renames.
      expect(fromLezer).toEqual(fromParser);
    });
  }

  it('lexes a basic comment as Comment, not Identifier or Markdown', () => {
    const tree = lezerParser.parse('// hello\n@recipe(slug="x", title="X")\n@yield(x, 1:count)\n');
    const tokens: string[] = [];
    tree.iterate({
      enter(node) {
        if (node.name === 'Comment' || node.name === 'FunctionName') tokens.push(node.name);
        return undefined;
      },
    });
    expect(tokens).toEqual(['Comment', 'FunctionName', 'FunctionName']);
  });

  it('skips markdown lines without producing spurious Call nodes', () => {
    const source = `@recipe(slug="x", title="X")
@yield(x, 1:count)

## Method

This is a paragraph that mentions the word ingredient.

@step("Do the thing.")
`;
    const signatures = lezerCallSignatures(source);
    expect(signatures.map((s) => s.name)).toEqual(['recipe', 'yield', 'step']);
  });
});
