/**
 * Suggestions surfaced in the unit `<datalist>` for the shopping add form
 * (PRD-141 §ShoppingAddForm). Free-text entry is still allowed; this list
 * just speeds up the common cases. Kept short — long suggestion lists
 * defeat the purpose on mobile.
 */
export const SHOPPING_UNIT_SUGGESTIONS: readonly string[] = [
  'g',
  'kg',
  'ml',
  'l',
  'count',
  'bunch',
  'pack',
  'box',
];
