/**
 * RTL coverage for FridgePage — PRD-147.
 *
 * Asserts the header renders, the empty state shows when there are no
 * batches, and a populated view renders sections with batch rows.
 * Heavier behavioural coverage (mutation flows, modal validation) lives
 * in the per-modal tests and the API integration tests.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

import type { FridgeViewResponses } from '../../../food-api/types.gen.js';

type FridgeView = FridgeViewResponses[200];

const fridgeViewMock = vi.hoisted(() => vi.fn());
const fridgeRecipesUsingBatchMock = vi.hoisted(() => vi.fn());
const batchesGetMock = vi.hoisted(() => vi.fn());
const batchesCreateMock = vi.hoisted(() => vi.fn());
const batchesEditMock = vi.hoisted(() => vi.fn());
const batchesRelocateMock = vi.hoisted(() => vi.fn());
const batchesAdjustQtyMock = vi.hoisted(() => vi.fn());
const batchesDeleteMock = vi.hoisted(() => vi.fn());
const ingredientsListMock = vi.hoisted(() => vi.fn());
const ingredientsGetMock = vi.hoisted(() => vi.fn());
const prepStatesListMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  fridgeView: fridgeViewMock,
  fridgeRecipesUsingBatch: fridgeRecipesUsingBatchMock,
  batchesGet: batchesGetMock,
  batchesCreate: batchesCreateMock,
  batchesEdit: batchesEditMock,
  batchesRelocate: batchesRelocateMock,
  batchesAdjustQty: batchesAdjustQtyMock,
  batchesDelete: batchesDeleteMock,
  ingredientsList: ingredientsListMock,
  ingredientsGet: ingredientsGetMock,
  prepStatesList: prepStatesListMock,
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
  const client = useMemo(
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
    []
  );
  return (
    <QueryClientProvider client={client}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>{children}</MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
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
  beforeEach(() => {
    vi.clearAllMocks();
    fridgeRecipesUsingBatchMock.mockResolvedValue({ data: { items: [] } });
    ingredientsListMock.mockResolvedValue({ data: { items: [] } });
    prepStatesListMock.mockResolvedValue({ data: { items: [] } });
  });

  it('renders the heading and the Add batch button', async () => {
    fridgeViewMock.mockResolvedValue({ data: emptyView() });
    render(
      <Wrapper>
        <FridgePage />
      </Wrapper>
    );
    expect(screen.getByRole('heading', { name: /fridge/i, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /\+ add batch/i })).toBeInTheDocument();
    await screen.findByText(/nothing in the fridge yet/i);
  });

  it('shows the empty state when no visible batches', async () => {
    fridgeViewMock.mockResolvedValue({ data: emptyView() });
    render(
      <Wrapper>
        <FridgePage />
      </Wrapper>
    );
    expect(await screen.findByText(/nothing in the fridge yet/i)).toBeInTheDocument();
  });

  it('renders sections with batch rows when data is present', async () => {
    fridgeViewMock.mockResolvedValue({ data: viewWithOneTomato() });
    render(
      <Wrapper>
        <FridgePage />
      </Wrapper>
    );
    expect(await screen.findByRole('button', { name: /fridge \(1\)/i })).toBeInTheDocument();
    expect(screen.getByText(/Tomato \/ Diced/)).toBeInTheDocument();
    expect(screen.getByText(/200 g/)).toBeInTheDocument();
  });

  it('toggles a location section', async () => {
    fridgeViewMock.mockResolvedValue({ data: viewWithOneTomato() });
    const user = userEvent.setup();
    render(
      <Wrapper>
        <FridgePage />
      </Wrapper>
    );
    const toggle = await screen.findByRole('button', { name: /fridge \(1\)/i });
    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });
});
