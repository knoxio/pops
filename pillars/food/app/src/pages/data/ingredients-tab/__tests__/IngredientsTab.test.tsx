/**
 * Mocks the generated food SDK so the tree renders against a controlled
 * dataset.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const ingredientsListMock = vi.hoisted(() => vi.fn());
const ingredientsGetMock = vi.hoisted(() => vi.fn());
const ingredientsBlockersMock = vi.hoisted(() => vi.fn());
const ingredientsRecipeRefsMock = vi.hoisted(() => vi.fn());
const ingredientTagsListMock = vi.hoisted(() => vi.fn());
const ingredientTagsDistinctMock = vi.hoisted(() => vi.fn());
const ingredientsCreateMock = vi.hoisted(() => vi.fn());
const ingredientsRenameMock = vi.hoisted(() => vi.fn());
const ingredientsChangeParentMock = vi.hoisted(() => vi.fn());
const ingredientsDeleteMock = vi.hoisted(() => vi.fn());
const ingredientTagsSetMock = vi.hoisted(() => vi.fn());
const variantsCreateMock = vi.hoisted(() => vi.fn());
const variantsUpdateMock = vi.hoisted(() => vi.fn());
const variantsDeleteMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../food-api/index.js', () => ({
  ingredientsList: ingredientsListMock,
  ingredientsGet: ingredientsGetMock,
  ingredientsBlockers: ingredientsBlockersMock,
  ingredientsRecipeRefs: ingredientsRecipeRefsMock,
  ingredientTagsList: ingredientTagsListMock,
  ingredientTagsDistinct: ingredientTagsDistinctMock,
  ingredientsCreate: ingredientsCreateMock,
  ingredientsRename: ingredientsRenameMock,
  ingredientsChangeParent: ingredientsChangeParentMock,
  ingredientsDelete: ingredientsDeleteMock,
  ingredientTagsSet: ingredientTagsSetMock,
  variantsCreate: variantsCreateMock,
  variantsUpdate: variantsUpdateMock,
  variantsDelete: variantsDeleteMock,
}));

import { IngredientsTab } from '../../IngredientsTab';

interface ListItem {
  id: number;
  parentId: number | null;
  slug: string;
  name: string;
  defaultUnit: 'g' | 'ml' | 'count';
  densityGPerMl: number | null;
  notes: string | null;
  createdAt: string;
}

function row(overrides: Partial<ListItem> & { id: number; slug: string; name: string }): ListItem {
  return {
    parentId: null,
    defaultUnit: 'count',
    densityGPerMl: null,
    notes: null,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

interface VariantRow {
  id: number;
  ingredientId: number;
  slug: string;
  name: string;
  defaultUnit: 'g' | 'ml' | 'count';
  packageSizeG: number | null;
  defaultShelfLifeDaysFridge: number | null;
  defaultShelfLifeDaysFreezer: number | null;
  notes: string | null;
  createdAt: string;
}

function variantRow(
  over: Partial<VariantRow> & { id: number; slug: string; name: string }
): VariantRow {
  return {
    ingredientId: 5,
    defaultUnit: 'count',
    packageSizeG: null,
    defaultShelfLifeDaysFridge: null,
    defaultShelfLifeDaysFreezer: null,
    notes: null,
    createdAt: '2026-01-01',
    ...over,
  };
}

function seedList(items: readonly ListItem[]): void {
  ingredientsListMock.mockResolvedValue({ data: { items } });
}

function seedDetail(ingredient: ListItem | null, variants: readonly VariantRow[] = []): void {
  if (ingredient === null) {
    ingredientsGetMock.mockResolvedValue({ data: undefined });
    return;
  }
  ingredientsGetMock.mockResolvedValue({ data: { ingredient, variants } });
}

function renderWithRouter(initialPath = '/food/data/ingredients') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <IngredientsTab />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  ingredientsListMock.mockResolvedValue({ data: { items: [] } });
  ingredientsGetMock.mockResolvedValue({ data: undefined });
  ingredientsBlockersMock.mockResolvedValue({ data: { data: { variants: 0, aliases: 0 } } });
  ingredientsRecipeRefsMock.mockResolvedValue({ data: { count: 0, recipes: [] } });
  ingredientTagsListMock.mockResolvedValue({ data: { tags: [] } });
  ingredientTagsDistinctMock.mockResolvedValue({ data: { tags: [] } });
  ingredientsCreateMock.mockResolvedValue({ data: { id: 99 } });
  ingredientsRenameMock.mockResolvedValue({ data: { id: 5 } });
  ingredientsChangeParentMock.mockResolvedValue({ data: { id: 5 } });
  ingredientsDeleteMock.mockResolvedValue({ data: { ok: true } });
  ingredientTagsSetMock.mockResolvedValue({ data: { ok: true } });
  variantsCreateMock.mockResolvedValue({ data: { id: 12 } });
  variantsUpdateMock.mockResolvedValue({ data: { id: 11 } });
  variantsDeleteMock.mockResolvedValue({ data: { ok: true } });
});

describe('IngredientsTab', () => {
  it('renders the tree with children nested under their parent', async () => {
    const fruit = row({ id: 1, slug: 'fruit', name: 'Fruit' });
    const banana = row({ id: 2, slug: 'banana', name: 'Banana', parentId: 1 });
    seedList([fruit, banana]);
    renderWithRouter();
    expect(await screen.findByText('Fruit')).toBeInTheDocument();
    expect(screen.getByRole('tree', { name: /ingredient hierarchy/i })).toBeInTheDocument();
    expect(screen.queryByText('Banana')).not.toBeInTheDocument();
  });

  it('expanding a parent reveals its children', async () => {
    seedList([
      row({ id: 1, slug: 'fruit', name: 'Fruit' }),
      row({ id: 2, slug: 'banana', name: 'Banana', parentId: 1 }),
    ]);
    renderWithRouter();
    await userEvent.click(await screen.findByRole('button', { name: /expand/i }));
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('selecting a node loads its detail panel', async () => {
    const apple = row({ id: 5, slug: 'apple', name: 'Apple', defaultUnit: 'g' });
    seedList([apple]);
    seedDetail(apple, []);
    renderWithRouter();
    await userEvent.click(await screen.findByText('Apple'));
    expect(await screen.findByRole('heading', { name: 'Apple', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('g', { selector: 'dd' })).toBeInTheDocument();
  });

  it('shows the empty state when no ingredients exist', async () => {
    seedList([]);
    renderWithRouter();
    expect(await screen.findByText(/no ingredients yet/i)).toBeInTheDocument();
  });

  it('opens the create dialog and submits a valid form', async () => {
    seedList([]);
    renderWithRouter();
    await userEvent.click(await screen.findByRole('button', { name: /new ingredient/i }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^slug$/i), 'banana');
    await userEvent.type(within(dialog).getByLabelText(/^name$/i), 'Banana');
    await userEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(ingredientsCreateMock).toHaveBeenCalledWith({
        body: { slug: 'banana', name: 'Banana', defaultUnit: 'count', parentId: null },
      });
    });
  });

  it('surfaces a server-side error in the dialog', async () => {
    seedList([]);
    ingredientsCreateMock.mockResolvedValue({
      error: { message: 'Slug already registered' },
      response: { status: 409 },
    });
    renderWithRouter();
    await userEvent.click(await screen.findByRole('button', { name: /new ingredient/i }));
    await userEvent.type(screen.getByLabelText(/^slug$/i), 'banana');
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Banana');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/slug is already in use/i);
  });

  it('renders embedded variants when the detail returns any', async () => {
    const banana = row({ id: 5, slug: 'banana', name: 'Banana' });
    seedList([banana]);
    seedDetail(banana, [
      variantRow({
        id: 11,
        slug: 'raw',
        name: 'Raw',
        defaultShelfLifeDaysFridge: 7,
        defaultShelfLifeDaysFreezer: 90,
      }),
    ]);
    renderWithRouter();
    await userEvent.click(await screen.findByText('Banana'));
    expect(await screen.findByRole('heading', { name: /variants/i })).toBeInTheDocument();
    expect(screen.getAllByText(/fridge 7d/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/freezer 90d/i).length).toBeGreaterThan(0);
  });
});

describe('detail-panel CRUD', () => {
  function seedSelectedBanana(variants: readonly VariantRow[] = []) {
    const banana = row({ id: 5, slug: 'banana', name: 'Banana' });
    seedList([banana, row({ id: 6, slug: 'fruit', name: 'Fruit' })]);
    seedDetail(banana, variants);
    return banana;
  }

  it('rename dialog calls ingredientsRename with old + new slug', async () => {
    seedSelectedBanana();
    renderWithRouter();
    await userEvent.click(await screen.findByText('Banana'));
    await userEvent.click(await screen.findByRole('button', { name: /rename slug/i }));
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText(/new slug/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'bananas');
    await userEvent.click(within(dialog).getByRole('button', { name: /^rename$/i }));
    await waitFor(() => {
      expect(ingredientsRenameMock).toHaveBeenCalledWith({
        body: { oldSlug: 'banana', newSlug: 'bananas' },
      });
    });
  });

  it('change-parent dialog calls ingredientsChangeParent', async () => {
    seedSelectedBanana();
    renderWithRouter();
    await userEvent.click(await screen.findByText('Banana'));
    await userEvent.click(await screen.findByRole('button', { name: /change parent/i }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/new parent/i), '6');
    await userEvent.click(within(dialog).getByRole('button', { name: /^move$/i }));
    await waitFor(() => {
      expect(ingredientsChangeParentMock).toHaveBeenCalledWith({
        path: { id: 5 },
        body: { newParentId: 6 },
      });
    });
  });

  it('delete dialog disables Delete and lists blockers when variants exist', async () => {
    seedSelectedBanana();
    ingredientsBlockersMock.mockResolvedValue({ data: { data: { variants: 2, aliases: 0 } } });
    renderWithRouter();
    await userEvent.click(await screen.findByText('Banana'));
    await userEvent.click(await screen.findByRole('button', { name: /^delete$/i, hidden: false }));
    const dialog = await screen.findByRole('dialog');
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(/2 variants/i);
    const deleteButton = within(dialog).getAllByRole('button', { name: /^delete$/i })[0];
    expect(deleteButton).toBeDisabled();
    expect(ingredientsDeleteMock).not.toHaveBeenCalled();
  });

  it('delete dialog fires ingredientsDelete when blockers are zero', async () => {
    seedSelectedBanana();
    renderWithRouter();
    await userEvent.click(await screen.findByText('Banana'));
    await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getAllByRole('button', { name: /^delete$/i })[0]);
    await waitFor(() => {
      expect(ingredientsDeleteMock).toHaveBeenCalledWith({ path: { id: 5 } });
    });
  });

  it('add-variant submits variantsCreate with the form values', async () => {
    seedSelectedBanana();
    renderWithRouter();
    await userEvent.click(await screen.findByText('Banana'));
    await userEvent.click(await screen.findByRole('button', { name: /add variant/i }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^slug$/i), 'raw');
    await userEvent.type(within(dialog).getByLabelText(/^name$/i), 'Raw');
    await userEvent.type(within(dialog).getByLabelText(/fridge/i), '7');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(variantsCreateMock).toHaveBeenCalledWith({
        body: {
          ingredientId: 5,
          slug: 'raw',
          name: 'Raw',
          defaultUnit: 'count',
          packageSizeG: null,
          defaultShelfLifeDaysFridge: 7,
          defaultShelfLifeDaysFreezer: null,
          notes: null,
        },
      });
    });
  });

  it('edit-variant submits variantsUpdate with the patched fields', async () => {
    const variant = variantRow({ id: 11, slug: 'raw', name: 'Raw' });
    seedSelectedBanana([variant]);
    renderWithRouter();
    await userEvent.click(await screen.findByText('Banana'));
    await userEvent.click((await screen.findAllByRole('button', { name: /edit raw/i }))[0]);
    const dialog = screen.getByRole('dialog');
    const nameInput = within(dialog).getByLabelText(/^name$/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Fresh');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(variantsUpdateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          path: { id: 11 },
          body: expect.objectContaining({ name: 'Fresh', slug: 'raw' }),
        })
      );
    });
  });

  it('delete-variant confirm dispatches variantsDelete', async () => {
    const variant = variantRow({ id: 11, slug: 'raw', name: 'Raw' });
    seedSelectedBanana([variant]);
    renderWithRouter();
    await userEvent.click(await screen.findByText('Banana'));
    await userEvent.click((await screen.findAllByRole('button', { name: /delete raw/i }))[0]);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getAllByRole('button', { name: /^delete$/i })[0]);
    await waitFor(() => {
      expect(variantsDeleteMock).toHaveBeenCalledWith({ path: { id: 11 } });
    });
  });

  it('shows the recipe-ref count when the query returns matches', async () => {
    const banana = seedSelectedBanana();
    ingredientsRecipeRefsMock.mockResolvedValue({
      data: {
        count: 2,
        recipes: [
          { recipeId: 1, recipeSlug: 'smash-burger', recipeTitle: 'Smash burger' },
          { recipeId: 2, recipeSlug: 'banana-bread', recipeTitle: 'Banana bread' },
        ],
      },
    });
    renderWithRouter();
    await userEvent.click(await screen.findByText(banana.name));
    expect(await screen.findByTestId('recipe-refs-count')).toHaveTextContent(/2 recipes/i);
    await userEvent.click(screen.getByRole('button', { name: /^show$/i }));
    expect(screen.getByText('Smash burger')).toBeInTheDocument();
    expect(screen.getByText('Banana bread')).toBeInTheDocument();
  });
});

describe('?focus=<slug> deep-link', () => {
  it('selects the matching ingredient and highlights its tree row', async () => {
    const apple = row({ id: 7, slug: 'apple', name: 'Apple' });
    seedList([apple]);
    seedDetail(apple);
    renderWithRouter('/food/data/ingredients?focus=apple');
    expect(await screen.findByRole('heading', { name: 'Apple', level: 2 })).toBeInTheDocument();
    const row7 = document.querySelector('[data-ingredient-slug="apple"]');
    expect(row7?.getAttribute('data-highlighted')).toBe('true');
  });

  it('renders the not-found banner when the slug does not match anything', async () => {
    seedList([row({ id: 1, slug: 'apple', name: 'Apple' })]);
    renderWithRouter('/food/data/ingredients?focus=mango');
    expect(await screen.findByRole('status')).toHaveTextContent(/mango/i);
  });
});
