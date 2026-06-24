/**
 * Canonical prep-state fixtures.
 */

export interface PrepStateFixture {
  name: string;
  slug: string;
}

export const PREP_STATE_FIXTURES: readonly PrepStateFixture[] = [
  { name: 'Whole', slug: 'whole' },
  { name: 'Diced', slug: 'diced' },
  { name: 'Sliced', slug: 'sliced' },
  { name: 'Chopped', slug: 'chopped' },
  { name: 'Shredded', slug: 'shredded' },
  { name: 'Minced', slug: 'minced' },
  { name: 'Julienned', slug: 'julienned' },
  { name: 'Grated', slug: 'grated' },
  { name: 'Crushed', slug: 'crushed' },
  { name: 'Zested', slug: 'zested' },
  { name: 'Juiced', slug: 'juiced' },
  { name: 'Melted', slug: 'melted' },
  { name: 'Softened', slug: 'softened' },
  { name: 'Mashed', slug: 'mashed' },
  { name: 'Roughly chopped', slug: 'roughly-chopped' },
];
