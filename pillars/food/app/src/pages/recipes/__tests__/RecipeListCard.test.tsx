import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { RecipeListCard } from '../RecipeListCard.js';

import type { RecipeListItemView } from '../useRecipeListQuery.js';

const baseItem: RecipeListItemView = {
  slug: 'pancakes',
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

const t = (key: string, opts?: Record<string, unknown>): string => {
  if (opts && opts.min !== undefined) return `${key}=${opts.min as number}`;
  if (opts && opts.count !== undefined) return `${key}=${opts.count as number}`;
  return key;
};

function wrap(item: RecipeListItemView = baseItem) {
  return render(
    <MemoryRouter>
      <RecipeListCard item={item} t={t} />
    </MemoryRouter>
  );
}

describe('recipe-crud-pages — RecipeListCard', () => {
  it('renders the title and links to the detail route', () => {
    wrap();
    expect(screen.getByRole('link', { name: /banana pancakes/i })).toHaveAttribute(
      'href',
      '/food/recipes/pancakes'
    );
  });

  it('falls back to the slug when title is null', () => {
    wrap({ ...baseItem, title: null });
    expect(screen.getByRole('link')).toHaveAttribute('aria-label', 'pancakes');
  });

  it('renders a fallback thumbnail when heroImagePath is null', () => {
    wrap();
    expect(screen.getByTestId('recipe-card-thumb-fallback')).toBeInTheDocument();
  });

  it('derives the card-variant image path from hero_image_path', () => {
    wrap({ ...baseItem, heroImagePath: '42/hero.jpg' });
    expect(screen.getByRole('img')).toHaveAttribute('src', '/api/food/recipes/42/hero-card.webp');
  });

  it('shows the archived badge when archivedAt is set', () => {
    wrap({ ...baseItem, archivedAt: '2026-01-01' });
    expect(screen.getByText(/recipes\.list\.card\.archived/)).toBeInTheDocument();
  });

  it('shows the draft-only badge when hasCurrentVersion is false', () => {
    wrap({ ...baseItem, hasCurrentVersion: false });
    expect(screen.getByText(/recipes\.list\.card\.draftOnly/)).toBeInTheDocument();
  });

  it('caps the visible tag chips at 4 and shows an overflow count', () => {
    wrap({
      ...baseItem,
      tags: ['a', 'b', 'c', 'd', 'e', 'f'],
    });
    expect(screen.getByText(/recipes\.list\.card\.moreTags=2/)).toBeInTheDocument();
  });
});
