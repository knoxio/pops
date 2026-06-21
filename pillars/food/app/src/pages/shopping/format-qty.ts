/**
 * Number-to-display helper mirroring the renderer's `formatQty` —
 * integer → plain; otherwise toFixed(2) + trailing-zero strip.
 *
 * Kept in lockstep with the server-side `formatQty` in
 * `apps/pops-api/src/modules/food/shopping/generate.ts` so the preview
 * label matches the row inserted in the generated list.
 */
export function formatQty(qty: number): string {
  if (Number.isInteger(qty)) return String(qty);
  return Number(qty.toFixed(2))
    .toString()
    .replace(/(\.\d*?)0+$/, '$1')
    .replace(/\.$/, '');
}
