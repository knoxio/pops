/**
 * Mocks the generated food SDK (src/food-api) so the section renders against
 * controlled data without a live registry-mounted backend. Variant labels are
 * resolved via a separate ingredientsGet lookup, mocked independently here.
 *
 * See pillars/food/docs/prds/conversion-table.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const conversionsListWeightsMock = vi.hoisted(() => vi.fn());
const conversionsCreateWeightMock = vi.hoisted(() => vi.fn());
const conversionsUpdateWeightMock = vi.hoisted(() => vi.fn());
const conversionsDeleteWeightMock = vi.hoisted(() => vi.fn());
const ingredientsListMock = vi.hoisted(() => vi.fn());
const ingredientsGetMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../food-api/index.js', () => ({
  conversionsListWeights: conversionsListWeightsMock,
  conversionsCreateWeight: conversionsCreateWeightMock,
  conversionsUpdateWeight: conversionsUpdateWeightMock,
  conversionsDeleteWeight: conversionsDeleteWeightMock,
  ingredientsList: ingredientsListMock,
  ingredientsGet: ingredientsGetMock,
}));

import { WeightsSection } from '../WeightsSection';

import type { IngredientWeightRow } from '../types';

function withClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function row(overrides: Partial<IngredientWeightRow> & { id: number }): IngredientWeightRow {
  return {
    ingredientId: 100,
    variantId: null,
    unit: 'medium',
    grams: 150,
    notes: null,
    seeded: false,
    createdAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function seedIngredients(items: readonly { id: number; name: string; slug: string }[]): void {
  ingredientsListMock.mockResolvedValue({
    data: {
      items: items.map((i) => ({
        ...i,
        parentId: null,
        defaultUnit: 'g',
        densityGPerMl: null,
        notes: null,
        createdAt: '2026-01-01',
      })),
    },
  });
}

function seedWeights(rows: readonly IngredientWeightRow[]): void {
  conversionsListWeightsMock.mockResolvedValue({ data: { items: rows } });
}

function seedVariantLookup(variants: readonly { id: number; name: string; slug: string }[]): void {
  ingredientsGetMock.mockResolvedValue({
    data: {
      ingredient: { id: 0, name: '', slug: '' },
      variants,
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  seedIngredients([]);
  seedWeights([]);
  ingredientsGetMock.mockResolvedValue({
    data: { ingredient: { id: 0, name: '', slug: '' }, variants: [] },
  });
  conversionsCreateWeightMock.mockResolvedValue({ data: { data: row({ id: 99 }) } });
  conversionsUpdateWeightMock.mockResolvedValue({ data: { data: row({ id: 99 }) } });
  conversionsDeleteWeightMock.mockResolvedValue({ data: { ok: true } });
});

describe('WeightsSection', () => {
  it('renders rows with the ingredient name and any-variant label', async () => {
    seedIngredients([{ id: 100, name: 'Onion', slug: 'onion' }]);
    seedWeights([row({ id: 1 })]);
    render(withClient(<WeightsSection />));
    const r = await screen.findByTestId('weight-row-1');
    expect(within(r).getByText('Onion')).toBeInTheDocument();
    expect(within(r).getByText(/any variant/i)).toBeInTheDocument();
    expect(within(r).getByText('150')).toBeInTheDocument();
  });

  it('resolves variant labels from the ingredientsGet lookup', async () => {
    seedIngredients([{ id: 200, name: 'Egg', slug: 'egg' }]);
    seedWeights([row({ id: 2, ingredientId: 200, variantId: 7, unit: 'each', grams: 60 })]);
    seedVariantLookup([{ id: 7, name: 'Large', slug: 'large' }]);
    render(withClient(<WeightsSection />));
    const r = await screen.findByTestId('weight-row-2');
    await within(r).findByText('Large (large)');
  });

  it('falls back to "#id" when the variant lookup has not landed yet', async () => {
    seedIngredients([{ id: 200, name: 'Egg', slug: 'egg' }]);
    seedWeights([row({ id: 3, ingredientId: 200, variantId: 7, unit: 'each', grams: 60 })]);
    ingredientsGetMock.mockReturnValue(new Promise(() => {}));
    render(withClient(<WeightsSection />));
    const r = await screen.findByTestId('weight-row-3');
    expect(within(r).getByText('#7')).toBeInTheDocument();
  });

  it('disables delete on seeded rows', async () => {
    seedIngredients([{ id: 100, name: 'Onion', slug: 'onion' }]);
    seedWeights([row({ id: 4, seeded: true })]);
    render(withClient(<WeightsSection />));
    const r = await screen.findByTestId('weight-row-4');
    expect(within(r).getByRole('button', { name: /reseed to restore/i })).toBeDisabled();
  });

  it('passes the ingredient filter into the listWeights query input', async () => {
    seedIngredients([{ id: 100, name: 'Onion', slug: 'onion' }]);
    seedWeights([]);
    render(withClient(<WeightsSection />));
    await waitFor(() => expect(screen.getByRole('option', { name: /Onion/ })).toBeInTheDocument());
    await userEvent.selectOptions(screen.getByLabelText(/ingredient$/i), '100');
    await waitFor(() => {
      const lastCall = conversionsListWeightsMock.mock.lastCall?.[0] as
        | { query?: { ingredientId?: number } }
        | undefined;
      expect(lastCall?.query?.ingredientId).toBe(100);
    });
  });

  it('opens the create dialog and submits a valid form', async () => {
    seedIngredients([{ id: 100, name: 'Onion', slug: 'onion' }]);
    seedWeights([]);
    render(withClient(<WeightsSection />));
    await userEvent.click(screen.getByRole('button', { name: /add weight/i }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('option', { name: /Onion/ })).toBeInTheDocument()
    );
    await userEvent.selectOptions(within(dialog).getByLabelText(/^ingredient$/i), '100');
    await userEvent.type(within(dialog).getByLabelText(/^unit$/i), 'medium');
    await userEvent.type(within(dialog).getByLabelText(/^grams$/i), '150');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(conversionsCreateWeightMock).toHaveBeenCalledWith({
        body: { ingredientId: 100, variantId: null, unit: 'medium', grams: 150, notes: undefined },
      })
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('surfaces a server-side conflict in the create dialog', async () => {
    seedIngredients([{ id: 100, name: 'Onion', slug: 'onion' }]);
    seedWeights([]);
    conversionsCreateWeightMock.mockResolvedValue({
      error: { message: 'duplicate' },
      response: { status: 409 },
    });
    render(withClient(<WeightsSection />));
    await userEvent.click(screen.getByRole('button', { name: /add weight/i }));
    const dialog = await screen.findByRole('dialog');
    await waitFor(() =>
      expect(within(dialog).getByRole('option', { name: /Onion/ })).toBeInTheDocument()
    );
    await userEvent.selectOptions(within(dialog).getByLabelText(/^ingredient$/i), '100');
    await userEvent.type(within(dialog).getByLabelText(/^unit$/i), 'medium');
    await userEvent.type(within(dialog).getByLabelText(/^grams$/i), '150');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});
