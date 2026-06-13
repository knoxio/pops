/**
 * RTL coverage for FridgePage — PRD-147.
 *
 * Asserts the header renders, the empty state shows when there are no
 * batches, and a populated view renders sections with batch rows.
 * Heavier behavioural coverage (mutation flows, modal validation) lives
 * in the per-modal tests and the API integration tests.
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

import type { FridgeView } from '@pops/app-food-db';

const mockViewQuery = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (key === 'fridge.view') return mockViewQuery();
    if (key === 'fridge.recipesUsingBatch') return { data: { items: [] }, isLoading: false };
    if (key === 'ingredients.list') return { data: { items: [] } };
    if (key === 'ingredients.get') return { data: undefined };
    if (key === 'prepStates.list') return { data: { items: [] } };
    if (key === 'batches.get') return { data: null };
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (
      key === 'batches.create' ||
      key === 'batches.edit' ||
      key === 'batches.relocate' ||
      key === 'batches.adjustQty' ||
      key === 'batches.delete'
    ) {
      return { mutate: vi.fn(), isPending: false };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({ invalidate: vi.fn() }),
}));

import { FridgePage } from '../FridgePage.js';

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

function emptyView(): FridgeView {
  return {
    sections: [
      { location: 'pantry', count: 0, ingredients: [] },
      { location: 'fridge', count: 0, ingredients: [] },
      { location: 'freezer', count: 0, ingredients: [] },
      { location: 'other', count: 0, ingredients: [] },
    ],
    counts: { visible: 0, empty: 0, deleted: 0 },
  };
}

function viewWithOneTomato(): FridgeView {
  return {
    sections: [
      { location: 'pantry', count: 0, ingredients: [] },
      {
        location: 'fridge',
        count: 1,
        ingredients: [
          {
            ingredientId: 1,
            ingredientName: 'Tomato',
            ingredientSlug: 'tomato',
            batches: [
              {
                id: 100,
                variantName: 'Diced',
                variantSlug: 'diced',
                prepStateLabel: null,
                qtyRemaining: 200,
                unit: 'g',
                expiresAt: '2026-06-15T00:00:00.000Z',
                daysToExpiry: 5,
                producedAt: '2026-06-08T00:00:00.000Z',
                sourceType: 'purchase',
                sourceRecipeSlug: null,
                notes: null,
                deletedAt: null,
              },
            ],
          },
        ],
      },
      { location: 'freezer', count: 0, ingredients: [] },
      { location: 'other', count: 0, ingredients: [] },
    ],
    counts: { visible: 1, empty: 0, deleted: 0 },
  };
}

describe('FridgePage — PRD-147', () => {
  it('renders the heading and the Add batch button', () => {
    mockViewQuery.mockReturnValue({ data: emptyView(), isLoading: false, error: null });
    render(
      <Wrapper>
        <FridgePage />
      </Wrapper>
    );
    expect(screen.getByRole('heading', { name: /fridge/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ add batch/i })).toBeInTheDocument();
  });

  it('shows the empty state when no visible batches', () => {
    mockViewQuery.mockReturnValue({ data: emptyView(), isLoading: false, error: null });
    render(
      <Wrapper>
        <FridgePage />
      </Wrapper>
    );
    expect(screen.getByText(/nothing in the fridge yet/i)).toBeInTheDocument();
  });

  it('renders sections with batch rows when data is present', () => {
    mockViewQuery.mockReturnValue({
      data: viewWithOneTomato(),
      isLoading: false,
      error: null,
    });
    render(
      <Wrapper>
        <FridgePage />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: /fridge \(1\)/i })).toBeInTheDocument();
    expect(screen.getByText(/Tomato \/ Diced/)).toBeInTheDocument();
    expect(screen.getByText(/200 g/)).toBeInTheDocument();
  });

  it('toggles a location section', async () => {
    mockViewQuery.mockReturnValue({
      data: viewWithOneTomato(),
      isLoading: false,
      error: null,
    });
    const user = userEvent.setup();
    render(
      <Wrapper>
        <FridgePage />
      </Wrapper>
    );
    const toggle = screen.getByRole('button', { name: /fridge \(1\)/i });
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
