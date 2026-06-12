export const PILLARS = [
  'core',
  'finance',
  'media',
  'inventory',
  'cerebrum',
  'food',
  'lists',
] as const;

export type Pillar = (typeof PILLARS)[number];
