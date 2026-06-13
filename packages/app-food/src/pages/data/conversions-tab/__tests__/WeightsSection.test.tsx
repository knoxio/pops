/**
 * PRD-123 Phase C — WeightsSection smoke tests.
 *
 * Mocks `@pops/api-client` so the section renders against controlled data
 * and asserts:
 *   - rows render with the resolved ingredient + variant labels
 *   - the seeded badge + disabled delete render for seeded rows
 *   - the create dialog submits valid input through the mutation
 *   - the ingredient filter feeds into the listWeights query
 */
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { WeightsSection } from '../WeightsSection';

import type { IngredientWeightRow } from '../types';

interface MutationOpts {
  onSuccess?: (result: { ok: boolean; reason?: string }) => void;
  onError?: (err: unknown) => void;
}

vi.mock('@pops/pillar-sdk/client', () => {
  class PillarCallError extends Error {
    pillarId: string;
    result: { kind: string; pillar: string; message?: string };
    constructor(pillarId: string, result: { kind: string; pillar: string; message?: string }) {
      super(result.message ?? result.kind);
      this.pillarId = pillarId;
      this.result = result;
    }
  }
  return {
    PillarCallError,
    isNotFound: (err: unknown) => err instanceof PillarCallError && err.result.kind === 'not-found',
    isConflict: (err: unknown) => err instanceof PillarCallError && err.result.kind === 'conflict',
    isBadRequest: (err: unknown) =>
      err instanceof PillarCallError && err.result.kind === 'bad-request',
  };
});

const { PillarCallError: MockPillarCallError } = await import('@pops/pillar-sdk/client');

const mockListWeights = vi.fn();
const mockListIngredients = vi.fn();
const mockGetIngredient = vi.fn();
const mockUseQueries = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
let createOpts: MutationOpts = {};

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown, opts: unknown) => {
    const key = path.join('.');
    if (key === 'conversions.listWeights') return mockListWeights(input);
    if (key === 'ingredients.list') return mockListIngredients(input);
    if (key === 'ingredients.get') return mockGetIngredient(input, opts);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarQueries: (args: readonly unknown[]) => mockUseQueries(args),
  pillarQueryArg: <T,>(arg: T) => arg,
  usePillarMutation: (_pillarId: string, path: readonly string[], opts: MutationOpts) => {
    const key = path.join('.');
    if (key === 'conversions.createWeight') {
      createOpts = opts;
      return { mutate: mockCreateMutate, mutateAsync: vi.fn(), isPending: false };
    }
    if (key === 'conversions.updateWeight') {
      return { mutate: mockUpdateMutate, mutateAsync: vi.fn(), isPending: false };
    }
    if (key === 'conversions.deleteWeight') {
      return { mutate: mockDeleteMutate, mutateAsync: vi.fn(), isPending: false };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    invalidate: vi.fn(),
  }),
}));

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
  mockListIngredients.mockReturnValue({
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
    isLoading: false,
  });
}

function seedWeights(rows: readonly IngredientWeightRow[]): void {
  mockListWeights.mockReturnValue({ data: { items: rows }, isLoading: false });
}

function seedVariantLookup(variants: readonly { id: number; name: string; slug: string }[]): void {
  mockUseQueries.mockReturnValue(variants.map((v) => ({ data: { variants: [v] } })));
}

beforeEach(() => {
  vi.clearAllMocks();
  createOpts = {};
  mockUseQueries.mockReturnValue([]);
  mockGetIngredient.mockReturnValue({ data: undefined, isLoading: false });
});

describe('PRD-123 Phase C — WeightsSection', () => {
  it('renders rows with the ingredient name and any-variant label', () => {
    seedIngredients([{ id: 100, name: 'Onion', slug: 'onion' }]);
    seedWeights([row({ id: 1 })]);
    render(<WeightsSection />);
    const r = screen.getByTestId('weight-row-1');
    expect(within(r).getByText('Onion')).toBeInTheDocument();
    expect(within(r).getByText(/any variant/i)).toBeInTheDocument();
    expect(within(r).getByText('150')).toBeInTheDocument();
  });

  it('resolves variant labels from useQueries lookup', () => {
    seedIngredients([{ id: 200, name: 'Egg', slug: 'egg' }]);
    seedWeights([row({ id: 2, ingredientId: 200, variantId: 7, unit: 'each', grams: 60 })]);
    seedVariantLookup([{ id: 7, name: 'Large', slug: 'large' }]);
    render(<WeightsSection />);
    const r = screen.getByTestId('weight-row-2');
    expect(within(r).getByText('Large (large)')).toBeInTheDocument();
  });

  it('falls back to "#id" when the variant lookup has not landed yet', () => {
    seedIngredients([{ id: 200, name: 'Egg', slug: 'egg' }]);
    seedWeights([row({ id: 3, ingredientId: 200, variantId: 7, unit: 'each', grams: 60 })]);
    mockUseQueries.mockReturnValue([{ data: undefined }]);
    render(<WeightsSection />);
    expect(within(screen.getByTestId('weight-row-3')).getByText('#7')).toBeInTheDocument();
  });

  it('disables delete on seeded rows', () => {
    seedIngredients([{ id: 100, name: 'Onion', slug: 'onion' }]);
    seedWeights([row({ id: 4, seeded: true })]);
    render(<WeightsSection />);
    expect(
      within(screen.getByTestId('weight-row-4')).getByRole('button', {
        name: /reseed to restore/i,
      })
    ).toBeDisabled();
  });

  it('passes the ingredient filter into the listWeights query input', async () => {
    seedIngredients([{ id: 100, name: 'Onion', slug: 'onion' }]);
    seedWeights([]);
    render(<WeightsSection />);
    await userEvent.selectOptions(screen.getByLabelText(/ingredient$/i), '100');
    const lastCall = mockListWeights.mock.lastCall?.[0] as { ingredientId?: number } | undefined;
    expect(lastCall?.ingredientId).toBe(100);
  });

  it('opens the create dialog and submits a valid form', async () => {
    seedIngredients([{ id: 100, name: 'Onion', slug: 'onion' }]);
    seedWeights([]);
    render(<WeightsSection />);
    await userEvent.click(screen.getByRole('button', { name: /add weight/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/^ingredient$/i), '100');
    await userEvent.type(within(dialog).getByLabelText(/^unit$/i), 'medium');
    await userEvent.type(within(dialog).getByLabelText(/^grams$/i), '150');
    await userEvent.click(within(dialog).getByRole('button', { name: /save/i }));
    expect(mockCreateMutate).toHaveBeenCalledWith(
      { ingredientId: 100, variantId: null, unit: 'medium', grams: 150, notes: undefined },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
    // Dialog stays open until the server confirms — close only on onSuccess.
    expect(screen.queryByRole('dialog')).toBeInTheDocument();
    act(() => mockCreateMutate.mock.lastCall?.[1]?.onSuccess?.());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('surfaces a server-side conflict in the create dialog', async () => {
    seedIngredients([{ id: 100, name: 'Onion', slug: 'onion' }]);
    seedWeights([]);
    render(<WeightsSection />);
    await userEvent.click(screen.getByRole('button', { name: /add weight/i }));
    act(() =>
      createOpts.onError?.(
        new MockPillarCallError('food', { kind: 'conflict', pillar: 'food', message: 'duplicate' })
      )
    );
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/already exists/i);
  });
});
