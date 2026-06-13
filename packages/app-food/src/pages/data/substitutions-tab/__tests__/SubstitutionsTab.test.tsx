import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SubstitutionsTab } from '../../SubstitutionsTab';

const mockListHydratedQuery = vi.fn();
const mockSlugSearchQuery = vi.fn();
const mockIngredientGetQuery = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockDeleteMutate = vi.fn();
let createOpts: { onSuccess?: () => void; onError?: (e: unknown) => void } = {};
let _updateOpts: { onSuccess?: () => void; onError?: (e: unknown) => void } = {};
let _deleteOpts: { onSuccess?: () => void; onError?: (e: unknown) => void } = {};
const mockInvalidate = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown, opts: unknown) => {
    const key = path.join('.');
    if (key === 'substitutions.listHydrated') return mockListHydratedQuery(input);
    if (key === 'slugs.search') return mockSlugSearchQuery(input, opts);
    if (key === 'ingredients.get') return mockIngredientGetQuery(input, opts);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: { onSuccess?: () => void; onError?: (e: unknown) => void }
  ) => {
    const key = path.join('.');
    if (key === 'substitutions.create') {
      createOpts = opts;
      return { mutate: mockCreateMutate, mutateAsync: vi.fn(), isPending: false };
    }
    if (key === 'substitutions.update') {
      _updateOpts = opts;
      return { mutate: mockUpdateMutate, mutateAsync: vi.fn(), isPending: false };
    }
    if (key === 'substitutions.delete') {
      _deleteOpts = opts;
      return { mutate: mockDeleteMutate, mutateAsync: vi.fn(), isPending: false };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    invalidate: mockInvalidate,
  }),
}));

function row(
  overrides: Partial<{
    id: number;
    ratio: number;
    scope: 'global' | 'recipe';
    recipeId: number | null;
    recipeSlug: string | null;
    contextTags: readonly string[];
    fromSlug: string;
    toSlug: string;
    fromKind: 'ingredient' | 'variant';
    toKind: 'ingredient' | 'variant';
  }> & { id: number }
) {
  const fromKind = overrides.fromKind ?? 'ingredient';
  const toKind = overrides.toKind ?? 'ingredient';
  return {
    id: overrides.id,
    fromIngredientId: fromKind === 'ingredient' ? 100 : null,
    fromVariantId: fromKind === 'variant' ? 200 : null,
    toIngredientId: toKind === 'ingredient' ? 300 : null,
    toVariantId: toKind === 'variant' ? 400 : null,
    ratio: overrides.ratio ?? 1,
    scope: overrides.scope ?? 'global',
    recipeId: overrides.recipeId ?? null,
    notes: null,
    createdAt: '2026-06-09',
    contextTags: overrides.contextTags ?? [],
    from: {
      kind: fromKind,
      id: fromKind === 'ingredient' ? 100 : 200,
      slug: overrides.fromSlug ?? 'butter',
      name: 'From',
      parentSlug: fromKind === 'variant' ? 'milk' : null,
    },
    to: {
      kind: toKind,
      id: toKind === 'ingredient' ? 300 : 400,
      slug: overrides.toSlug ?? 'olive-oil',
      name: 'To',
      parentSlug: toKind === 'variant' ? 'olive' : null,
    },
    recipeSlug: overrides.recipeSlug ?? null,
  };
}

function seedList(rows: ReturnType<typeof row>[]) {
  mockListHydratedQuery.mockReturnValue({ data: { items: rows }, isLoading: false });
}

beforeEach(() => {
  vi.clearAllMocks();
  createOpts = {};
  _updateOpts = {};
  _deleteOpts = {};
  mockSlugSearchQuery.mockReturnValue({ data: { items: [] }, isLoading: false });
  mockIngredientGetQuery.mockReturnValue({ data: undefined, isLoading: false });
});

describe('PRD-122-D — SubstitutionsTab', () => {
  it('renders rows for each substitution returned by listHydrated', () => {
    seedList([
      row({ id: 1, ratio: 1.25, contextTags: ['baking'] }),
      row({ id: 2, fromSlug: 'sugar', toSlug: 'honey', ratio: 0.75 }),
    ]);
    render(<SubstitutionsTab />);
    expect(screen.getByTestId('sub-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('sub-row-2')).toBeInTheDocument();
    expect(screen.getByText('butter')).toBeInTheDocument();
    expect(screen.getByText('honey')).toBeInTheDocument();
    expect(screen.getByText('baking')).toBeInTheDocument();
  });

  it('renders variant endpoints with parent slug prefix', () => {
    seedList([
      row({ id: 3, fromKind: 'variant', fromSlug: 'whole', toKind: 'variant', toSlug: 'skim' }),
    ]);
    render(<SubstitutionsTab />);
    expect(screen.getByText('milk:whole')).toBeInTheDocument();
    expect(screen.getByText('olive:skim')).toBeInTheDocument();
  });

  it('shows the empty state when no rows match', () => {
    seedList([]);
    render(<SubstitutionsTab />);
    expect(screen.getByText(/no substitutions match/i)).toBeInTheDocument();
  });

  it('clicking Edit reveals inline ratio + tags inputs and Save fires update mutation', async () => {
    seedList([row({ id: 5, ratio: 1, contextTags: ['baking'] })]);
    render(<SubstitutionsTab />);
    const row5 = screen.getByTestId('sub-row-5');
    await userEvent.click(within(row5).getByRole('button', { name: /^edit$/i }));
    const ratioInput = within(row5).getByLabelText(/edit ratio for substitution 5/i);
    await userEvent.clear(ratioInput);
    await userEvent.type(ratioInput, '2.5');
    const tagsInput = within(row5).getByLabelText(/edit context tags for substitution 5/i);
    await userEvent.clear(tagsInput);
    await userEvent.type(tagsInput, 'baking, vegan');
    await userEvent.click(within(row5).getByRole('button', { name: /^save$/i }));
    expect(mockUpdateMutate).toHaveBeenCalledWith({
      id: 5,
      ratio: 2.5,
      contextTags: ['baking', 'vegan'],
    });
  });

  it('Delete button fires the delete mutation', async () => {
    seedList([row({ id: 7 })]);
    render(<SubstitutionsTab />);
    const row7 = screen.getByTestId('sub-row-7');
    await userEvent.click(within(row7).getByRole('button', { name: /^delete$/i }));
    expect(mockDeleteMutate).toHaveBeenCalledWith({ id: 7 });
  });

  it('surfaces a duplicate error from the create mutation', async () => {
    seedList([]);
    render(<SubstitutionsTab />);
    createOpts.onError?.({ message: 'already exists', data: { code: 'CONFLICT' } });
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });

  it('filter scope=recipe reveals a recipeId filter input and includes it in the list query', async () => {
    seedList([]);
    render(<SubstitutionsTab />);
    const scopeSelect = screen.getByLabelText(/^scope$/i, { selector: '#sub-filter-scope' });
    await userEvent.selectOptions(scopeSelect, 'recipe');
    const recipeFilter = screen.getByLabelText(/recipe id/i, { selector: '#sub-filter-recipe' });
    await userEvent.type(recipeFilter, '42');
    const calls = mockListHydratedQuery.mock.calls;
    const lastInput = calls[calls.length - 1]?.[0] as { scope?: string; recipeId?: number };
    expect(lastInput.scope).toBe('recipe');
    expect(lastInput.recipeId).toBe(42);
  });

  it('recipe-scope rows display the recipe slug', () => {
    seedList([row({ id: 9, scope: 'recipe', recipeId: 42, recipeSlug: 'weeknight-pasta' })]);
    render(<SubstitutionsTab />);
    expect(screen.getByText(/recipe \(weeknight-pasta\)/i)).toBeInTheDocument();
  });
});
