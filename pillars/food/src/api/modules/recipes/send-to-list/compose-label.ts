/**
 * Shared label composer — used by the preview builder and the merge-time
 * relabel step. Format pinned by pillars/food/docs/prds/send-to-list:
 *
 *   "<qty> <unit> <ingredient_name>[ <variant_name>][ (<prep_label>)]"
 */
export interface ComposeArgs {
  qty: string;
  unit: string;
  ingredientName: string;
  variantName: string | null;
  prepLabel: string | null;
}

export function composeLabel({
  qty,
  unit,
  ingredientName,
  variantName,
  prepLabel,
}: ComposeArgs): string {
  const base = `${qty} ${unit} ${ingredientName}`.trim();
  const withVariant = variantName === null || variantName === '' ? base : `${base} ${variantName}`;
  return prepLabel === null || prepLabel === '' ? withVariant : `${withVariant} (${prepLabel})`;
}
