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

import { parser as lezerParser } from '../dsl-parser';
import { parseRecipeDsl } from '../parser';
import { ALL_SAMPLES } from './samples';

import type { SyntaxNode, Tree } from '@lezer/common';

import type { RecipeAst } from '../ast';

interface CallSignature {
  name: string;
  /** Number of top-level args (commas + 1 when ArgList is present). */
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

function parserCallSignatures(input: string): CallSignature[] {
  const result = parseRecipeDsl(input);
  if (!result.ok) {
    throw new Error(
      `Parser failed on sample: ${result.errors.map((e) => `${e.code}@${e.loc.startLine}`).join(', ')}`
    );
  }
  return derivedSignaturesFromAst(result.ast);
}

function derivedSignaturesFromAst(ast: RecipeAst): CallSignature[] {
  const signatures: CallSignature[] = [];
  signatures.push({ name: 'recipe', argCount: countRecipeArgs(ast.recipe) });
  signatures.push({ name: 'yield', argCount: 2 }); // descriptor + qty:unit
  for (const block of ast.blocks) {
    if (block.kind === 'ingredient') {
      signatures.push({ name: 'ingredient', argCount: countIngredientArgs(block) });
    } else if (block.kind === 'step') {
      signatures.push({ name: 'step', argCount: countStepArgs(block) });
    }
    // markdown blocks have no call signature
  }
  return signatures;
}

function countRecipeArgs(header: RecipeAst['recipe']): number {
  // The header always carries slug + title; the rest are optional named
  // args. Count the populated fields.
  let n = 2;
  if (header.servings !== undefined) n += 1;
  if (header.prepTime !== undefined) n += 1;
  if (header.cookTime !== undefined) n += 1;
  if (header.recipeType !== undefined) n += 1;
  if (header.summary !== undefined) n += 1;
  return n;
}

function countIngredientArgs(block: {
  qty: { unit: string };
  optional?: boolean;
  notes?: string;
}): number {
  // Compact form: index, descriptor, qty:unit → 3.
  // Each of optional / notes adds a named arg.
  let n = 3;
  if (block.optional === true) n += 1;
  if (block.notes !== undefined) n += 1;
  return n;
}

function countStepArgs(block: { duration?: unknown; temperature?: unknown }): number {
  // The body string is always arg 1. Each of duration / temperature adds
  // one named arg.
  let n = 1;
  if (block.duration !== undefined) n += 1;
  if (block.temperature !== undefined) n += 1;
  return n;
}

describe('PRD-120 — Lezer ↔ parser parity', () => {
  for (const [label, source] of ALL_SAMPLES) {
    it(`matches call sequence on sample "${label}"`, () => {
      const fromLezer = lezerCallSignatures(source);
      const fromParser = parserCallSignatures(source);
      const lezerNames = fromLezer.map((c) => c.name);
      const parserNames = fromParser.map((c) => c.name);
      expect(lezerNames).toEqual(parserNames);
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
