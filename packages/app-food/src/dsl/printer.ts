/**
 * `printRecipeAst` — reverse of `parseRecipeDsl` modulo whitespace.
 *
 * Always emits the compact descriptor form (`slug:variant:prep` with `_` for
 * skipped middle segments). Markdown blocks are emitted verbatim. Inline
 * `@time` / `@temperature` / `@N` / `@slug` are re-inserted into step bodies.
 */
import type {
  AstBlock,
  Descriptor,
  IngredientBlock,
  MarkdownBlock,
  QtyUnit,
  RecipeAst,
  StepBlock,
  StepBody,
} from './ast.js';

export function printRecipeAst(ast: RecipeAst): string {
  const parts: string[] = [];
  parts.push(printRecipe(ast.recipe));
  parts.push('');
  parts.push(printYield(ast.yield));
  for (const block of ast.blocks) {
    parts.push('');
    parts.push(printBlock(block));
  }
  return parts.join('\n');
}

function printRecipe(r: RecipeAst['recipe']): string {
  const lines: string[] = ['@recipe('];
  const named: string[] = [
    `  slug="${escapeString(r.slug)}"`,
    `  title="${escapeString(r.title)}"`,
  ];
  if (r.servings !== undefined) named.push(`  servings=${r.servings}`);
  if (r.prepTime !== undefined) named.push(`  prep_time=${printQty(r.prepTime)}`);
  if (r.cookTime !== undefined) named.push(`  cook_time=${printQty(r.cookTime)}`);
  if (r.recipeType !== undefined) named.push(`  recipe_type="${r.recipeType}"`);
  if (r.summary !== undefined) named.push(`  summary="${escapeString(r.summary)}"`);
  lines.push(named.join(',\n'));
  lines.push(')');
  return lines.join('\n');
}

function printYield(y: RecipeAst['yield']): string {
  return `@yield(${printDescriptor(y.descriptor)}, ${printQty(y.qty)})`;
}

function printBlock(b: AstBlock): string {
  switch (b.kind) {
    case 'ingredient':
      return printIngredient(b);
    case 'step':
      return printStep(b);
    case 'markdown':
      return printMarkdown(b);
  }
}

function printIngredient(b: IngredientBlock): string {
  const parts: string[] = [String(b.index), printDescriptor(b.descriptor), printQty(b.qty)];
  if (b.optional === true) parts.push('optional=true');
  if (b.notes !== undefined) parts.push(`notes="${escapeString(b.notes)}"`);
  return `@ingredient(${parts.join(', ')})`;
}

function printStep(b: StepBlock): string {
  const body = printStepBody(b.body);
  const parts: string[] = [`"${body}"`];
  if (b.duration !== undefined) parts.push(`duration=${printQty(b.duration)}`);
  if (b.temperature !== undefined) parts.push(`temperature=${printQty(b.temperature)}`);
  return `@step(${parts.join(', ')})`;
}

function printMarkdown(b: MarkdownBlock): string {
  return b.text;
}

function printDescriptor(d: Descriptor): string {
  if (d.variant === undefined && d.prep === undefined) return d.ingredient;
  if (d.prep === undefined) return `${d.ingredient}:${d.variant ?? '_'}`;
  const variant = d.variant ?? '_';
  return `${d.ingredient}:${variant}:${d.prep}`;
}

function printQty(q: QtyUnit): string {
  // Preserve integer formatting where possible to stabilise round-trip.
  const qty = Number.isInteger(q.qty) ? String(q.qty) : String(q.qty);
  return `${qty}:${q.unit}`;
}

function printStepBody(body: StepBody): string {
  let out = '';
  for (const part of body) {
    switch (part.kind) {
      case 'text':
        out += escapeString(part.value);
        break;
      case 'ref':
        out += `@${part.ref}`;
        break;
      case 'time':
        out += `@time(${printQty(part.qty)})`;
        break;
      case 'temperature':
        out += `@temperature(${printQty(part.qty)})`;
        break;
    }
  }
  return out;
}

function escapeString(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}
