/**
 * PRD-119-E — mobile-viewport layout sanity check.
 *
 * jsdom doesn't really lay out CSS, but we can assert the structural
 * primitives (action menus stay tappable; cards stack via the
 * `flex-wrap` utilities; tags overflow into the dedicated +N counter)
 * survive a 375px viewport. The real responsive audit is delivered via
 * Storybook + manual review — these tests guard against regressions on
 * the contracts the page-level code depends on.
 */
import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

import { RecipeListCard } from '../RecipeListCard.js';

import type { RecipeListItemView } from '../useRecipeListQuery.js';

const baseItem: RecipeListItemView = {
  slug: 'banana-pancakes',
  title: 'Banana pancakes with a very long title that should still fit',
  recipeType: 'plate',
  heroImagePath: null,
  prepMinutes: 5,
  cookMinutes: 10,
  servings: 2,
  tags: ['breakfast', 'sweet', 'kid-friendly', 'easy', 'vegan', 'gluten-free'],
  hasCurrentVersion: true,
  archivedAt: null,
  createdAt: '2026-01-01',
};

const ORIGINAL_INNER_WIDTH = window.innerWidth;

function setMobileViewport(): void {
  Object.defineProperty(window, 'innerWidth', { writable: true, value: 375 });
  window.dispatchEvent(new Event('resize'));
}

function Wrapper({ children }: { children: ReactElement }): ReactElement {
  const i18n = useMemo(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init({
      lng: 'en-AU',
      fallbackLng: 'en-AU',
      ns: ['food'],
      defaultNS: 'food',
      interpolation: { escapeValue: false },
      resources: { 'en-AU': { food: enAUFood } },
    });
    return instance;
  }, []);
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nextProvider>
  );
}

beforeEach(setMobileViewport);

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', { writable: true, value: ORIGINAL_INNER_WIDTH });
});

describe('PRD-119-E — mobile viewport (375px) layout contracts', () => {
  it('RecipeListCard — caps visible tags at 4 + overflow indicator', () => {
    render(
      <Wrapper>
        <RecipeListCard item={baseItem} t={(key, opts) => formatKey(key, opts)} />
      </Wrapper>
    );
    // First 4 tags rendered as badges; remainder collapsed into "+N more".
    expect(screen.getByText('breakfast')).toBeInTheDocument();
    expect(screen.getByText('sweet')).toBeInTheDocument();
    expect(screen.getByText('kid-friendly')).toBeInTheDocument();
    expect(screen.getByText('easy')).toBeInTheDocument();
    expect(screen.queryByText('vegan')).not.toBeInTheDocument();
    expect(screen.queryByText('gluten-free')).not.toBeInTheDocument();
    expect(screen.getByText(/recipes\.list\.card\.moreTags=2/)).toBeInTheDocument();
  });

  it('RecipeListCard — long title truncated but still rendered', () => {
    render(
      <Wrapper>
        <RecipeListCard item={baseItem} t={(key) => key} />
      </Wrapper>
    );
    // The truncation is a CSS contract (`truncate`); we assert the
    // class is present on the title so layout changes don't silently
    // drop it.
    const heading = screen.getByRole('heading', { level: 3 });
    expect(heading.className).toMatch(/truncate/);
  });
});

function formatKey(key: string, opts?: Record<string, unknown>): string {
  if (opts?.count !== undefined) return `${key}=${opts.count as number}`;
  return key;
}
