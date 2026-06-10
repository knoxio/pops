/**
 * Translates a server-side `sectionLabel` to its i18n key when one exists;
 * falls back to the raw server label otherwise (so a user-defined
 * `store-section:my-custom` tag still renders something readable).
 */
import type { TFunction } from 'i18next';

const LABEL_KEYS = {
  Bakery: 'shopping.fromPlan.sectionLabel.Bakery',
  Beverages: 'shopping.fromPlan.sectionLabel.Beverages',
  Condiments: 'shopping.fromPlan.sectionLabel.Condiments',
  Dairy: 'shopping.fromPlan.sectionLabel.Dairy',
  Frozen: 'shopping.fromPlan.sectionLabel.Frozen',
  Meat: 'shopping.fromPlan.sectionLabel.Meat',
  Pantry: 'shopping.fromPlan.sectionLabel.Pantry',
  Produce: 'shopping.fromPlan.sectionLabel.Produce',
} as const;

type KnownLabel = keyof typeof LABEL_KEYS;

function isKnownLabel(s: string): s is KnownLabel {
  return Object.prototype.hasOwnProperty.call(LABEL_KEYS, s);
}

export function translateSectionLabel(t: TFunction<'food'>, serverLabel: string): string {
  if (isKnownLabel(serverLabel)) return t(LABEL_KEYS[serverLabel]);
  return serverLabel;
}
