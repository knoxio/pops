import { MemoryRouter } from 'react-router';

import { RecipeListCard } from './RecipeListCard';

import type { Meta, StoryObj } from '@storybook/react-vite';

import type { RecipeListItemView } from './useRecipeListQuery';

const baseItem: RecipeListItemView = {
  slug: 'banana-pancakes',
  title: 'Banana pancakes',
  recipeType: 'plate',
  heroImagePath: null,
  prepMinutes: 5,
  cookMinutes: 10,
  servings: 2,
  tags: ['breakfast', 'sweet'],
  hasCurrentVersion: true,
  archivedAt: null,
  createdAt: '2026-01-01',
};

function Host({ item }: { item: RecipeListItemView }) {
  return (
    <MemoryRouter>
      <div className="bg-background max-w-2xl p-4">
        <RecipeListCard item={item} t={(key, opts) => formatKey(key, opts)} />
      </div>
    </MemoryRouter>
  );
}

const meta: Meta<typeof Host> = {
  title: 'Food/recipes/RecipeListCard',
  component: Host,
  parameters: { layout: 'fullscreen' },
  tags: ['autodocs'],
};
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { args: { item: baseItem } };
export const DraftOnly: Story = {
  args: { item: { ...baseItem, hasCurrentVersion: false } },
};
export const Archived: Story = {
  args: { item: { ...baseItem, archivedAt: '2026-01-15' } },
};
export const ManyTags: Story = {
  args: { item: { ...baseItem, tags: ['breakfast', 'sweet', 'easy', 'kid-friendly', 'vegan'] } },
};
export const NoTitle: Story = {
  args: { item: { ...baseItem, title: null } },
};

function formatKey(key: string, opts?: Record<string, unknown>): string {
  if (opts?.min !== undefined) return `${key}=${opts.min as number}`;
  if (opts?.count !== undefined) return `${key}=${opts.count as number}`;
  return key;
}
