import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const substitutionsListHydratedMock = vi.hoisted(() => vi.fn());
const slugsSearchMock = vi.hoisted(() => vi.fn());
const ingredientsGetMock = vi.hoisted(() => vi.fn());
const substitutionsCreateMock = vi.hoisted(() => vi.fn());
const substitutionsUpdateMock = vi.hoisted(() => vi.fn());
const substitutionsDeleteMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../food-api/index.js', () => ({
  substitutionsListHydrated: substitutionsListHydratedMock,
  slugsSearch: slugsSearchMock,
  ingredientsGet: ingredientsGetMock,
  substitutionsCreate: substitutionsCreateMock,
  substitutionsUpdate: substitutionsUpdateMock,
  substitutionsDelete: substitutionsDeleteMock,
}));

import { SubstitutionsTab } from '../../SubstitutionsTab';

function withClient(children: ReactNode): JSX.Element {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function renderTab(): void {
  render(withClient(<SubstitutionsTab />));
}

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
  substitutionsListHydratedMock.mockResolvedValue({ data: { items: rows } });
}

beforeEach(() => {
  vi.clearAllMocks();
  substitutionsListHydratedMock.mockResolvedValue({ data: { items: [] } });
  slugsSearchMock.mockResolvedValue({ data: { items: [] } });
  ingredientsGetMock.mockResolvedValue({ data: { ingredient: {}, variants: [] } });
  substitutionsCreateMock.mockResolvedValue({ data: {} });
  substitutionsUpdateMock.mockResolvedValue({ data: {} });
  substitutionsDeleteMock.mockResolvedValue({ data: { ok: true } });
});

describe('PRD-122-D — SubstitutionsTab', () => {
  it('renders rows for each substitution returned by listHydrated', async () => {
    seedList([
      row({ id: 1, ratio: 1.25, contextTags: ['baking'] }),
      row({ id: 2, fromSlug: 'sugar', toSlug: 'honey', ratio: 0.75 }),
    ]);
    renderTab();
    expect(await screen.findByTestId('sub-row-1')).toBeInTheDocument();
    expect(screen.getByTestId('sub-row-2')).toBeInTheDocument();
    expect(screen.getByText('butter')).toBeInTheDocument();
    expect(screen.getByText('honey')).toBeInTheDocument();
    expect(screen.getByText('baking')).toBeInTheDocument();
  });

  it('renders variant endpoints with parent slug prefix', async () => {
    seedList([
      row({ id: 3, fromKind: 'variant', fromSlug: 'whole', toKind: 'variant', toSlug: 'skim' }),
    ]);
    renderTab();
    expect(await screen.findByText('milk:whole')).toBeInTheDocument();
    expect(screen.getByText('olive:skim')).toBeInTheDocument();
  });

  it('shows the empty state when no rows match', async () => {
    seedList([]);
    renderTab();
    expect(await screen.findByText(/no substitutions match/i)).toBeInTheDocument();
  });

  it('clicking Edit reveals inline ratio + tags inputs and Save fires update mutation', async () => {
    seedList([row({ id: 5, ratio: 1, contextTags: ['baking'] })]);
    renderTab();
    const row5 = await screen.findByTestId('sub-row-5');
    await userEvent.click(within(row5).getByRole('button', { name: /^edit$/i }));
    const ratioInput = within(row5).getByLabelText(/edit ratio for substitution 5/i);
    await userEvent.clear(ratioInput);
    await userEvent.type(ratioInput, '2.5');
    const tagsInput = within(row5).getByLabelText(/edit context tags for substitution 5/i);
    await userEvent.clear(tagsInput);
    await userEvent.type(tagsInput, 'baking, vegan');
    await userEvent.click(within(row5).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(substitutionsUpdateMock).toHaveBeenCalledWith({
        path: { id: 5 },
        body: { ratio: 2.5, contextTags: ['baking', 'vegan'] },
      });
    });
  });

  it('Delete button fires the delete mutation', async () => {
    seedList([row({ id: 7 })]);
    renderTab();
    const row7 = await screen.findByTestId('sub-row-7');
    await userEvent.click(within(row7).getByRole('button', { name: /^delete$/i }));
    await waitFor(() => {
      expect(substitutionsDeleteMock).toHaveBeenCalledWith({ path: { id: 7 } });
    });
  });

  it('surfaces a duplicate error from create', async () => {
    seedList([]);
    slugsSearchMock.mockResolvedValue({
      data: { items: [{ kind: 'ingredient', name: 'Butter', slug: 'butter', targetId: 100 }] },
    });
    substitutionsCreateMock.mockResolvedValue({
      error: { message: 'already exists' },
      response: { status: 409 },
    });
    renderTab();

    const form = screen.getByRole('form', { name: /add substitution/i });
    const [fromBox, toBox] = within(form).getAllByPlaceholderText(/search slug/i);
    await userEvent.type(fromBox, 'butter');
    await userEvent.click(await within(form).findByRole('option', { name: /butter/i }));
    await userEvent.type(toBox, 'butter');
    await userEvent.click(await within(form).findByRole('option', { name: /butter/i }));

    await userEvent.click(within(form).getByRole('button', { name: /^add$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/i);
  });

  it('filter scope=recipe reveals a recipeId filter input and includes it in the list query', async () => {
    seedList([]);
    renderTab();
    const scopeSelect = screen.getByLabelText(/^scope$/i, { selector: '#sub-filter-scope' });
    await userEvent.selectOptions(scopeSelect, 'recipe');
    const recipeFilter = screen.getByLabelText(/recipe id/i, { selector: '#sub-filter-recipe' });
    await userEvent.type(recipeFilter, '42');
    await waitFor(() => {
      const lastInput = substitutionsListHydratedMock.mock.lastCall?.[0]?.query as {
        scope?: string;
        recipeId?: number;
      };
      expect(lastInput.scope).toBe('recipe');
      expect(lastInput.recipeId).toBe(42);
    });
  });

  it('recipe-scope rows display the recipe slug', async () => {
    seedList([row({ id: 9, scope: 'recipe', recipeId: 42, recipeSlug: 'weeknight-pasta' })]);
    renderTab();
    expect(await screen.findByText(/recipe \(weeknight-pasta\)/i)).toBeInTheDocument();
  });
});
