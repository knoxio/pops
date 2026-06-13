/**
 * PRD-122-B / PRD-122-B2 — ingredients tab UI smoke tests.
 *
 * Mocks `@pops/api-client` so the tree renders against a controlled
 * dataset; asserts:
 *   - the tree groups children under their parents
 *   - selecting a node renders the detail panel
 *   - the create dialog opens and submits via the mutation
 *   - the create dialog surfaces a server error
 *   - rename / change-parent / delete flows wire to the right mutations
 *   - variant create + edit + delete flows wire to the right mutations
 *   - delete-with-blockers disables the destructive button and lists blockers
 *   - the `?focus=<slug>` deep-link selects + highlights the matching node
 *   - the not-found banner appears when `?focus` doesn't match anything
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IngredientsTab } from '../../IngredientsTab';

interface CallStub {
  mutate: ReturnType<typeof vi.fn>;
  options: {
    onSuccess?: (result?: unknown) => void;
    onError?: (err: unknown) => void;
  };
  isPending: boolean;
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

const mockListQuery = vi.fn();
const mockGetQuery = vi.fn();
const mockBlockersQuery = vi.fn(() => ({ data: { variants: 0, aliases: 0 } }));
const mockRecipeRefsQuery = vi.fn(() => ({ data: { count: 0, recipes: [] }, isLoading: false }));
const mockInvalidateList = vi.fn();
const mockInvalidateGet = vi.fn();
const mockInvalidateBlockers = vi.fn();
const mockInvalidateTagsList = vi.fn();
const mockInvalidateTagsDistinct = vi.fn();
// Stable references avoid an infinite-render loop in IngredientTagsEditor's
// `useEffect`-on-remote-tags, which compares the array via the cached
// useQuery result. A fresh literal per call kept changing identity → loop.
const TAGS_LIST_RESULT = { data: { tags: [] as string[] }, isLoading: false };
const TAGS_DISTINCT_RESULT = {
  data: { tags: [] as Array<{ tag: string; ingredientCount: number; firstSeenAt: string }> },
  isLoading: false,
};

const stubs: Record<string, CallStub> = {};
function makeStub(): CallStub {
  return { mutate: vi.fn(), options: {}, isPending: false };
}
function resetStubs() {
  for (const key of [
    'createIngredient',
    'renameIngredient',
    'changeParent',
    'deleteIngredient',
    'createVariant',
    'updateVariant',
    'deleteVariant',
    'setTags',
  ]) {
    stubs[key] = makeStub();
  }
}

function recordMutation(key: string, opts: CallStub['options']): CallStub {
  stubs[key].options = opts;
  return stubs[key];
}

const QUERY_HANDLERS: Record<string, (input: unknown, opts: unknown) => unknown> = {
  'ingredients.list': (input) => mockListQuery(input),
  'ingredients.get': (input, opts) => mockGetQuery(input, opts),
  'ingredients.blockers': (input, opts) => mockBlockersQuery(input, opts),
  'ingredients.recipeRefs': (input, opts) => mockRecipeRefsQuery(input, opts),
  'ingredients.tags.list': () => TAGS_LIST_RESULT,
  'ingredients.tags.distinct': () => TAGS_DISTINCT_RESULT,
};

const MUTATION_KEYS: Record<string, string> = {
  'ingredients.create': 'createIngredient',
  'ingredients.rename': 'renameIngredient',
  'ingredients.changeParent': 'changeParent',
  'ingredients.delete': 'deleteIngredient',
  'ingredients.tags.set': 'setTags',
  'variants.create': 'createVariant',
  'variants.update': 'updateVariant',
  'variants.delete': 'deleteVariant',
};

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown, opts: unknown) => {
    const key = path.join('.');
    const handler = QUERY_HANDLERS[key];
    if (handler) return handler(input, opts);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (_pillarId: string, path: readonly string[], opts: CallStub['options']) => {
    const key = path.join('.');
    const stubKey = MUTATION_KEYS[key];
    if (!stubKey) throw new Error(`Unexpected pillar mutation: ${key}`);
    const stub = recordMutation(stubKey, opts);
    return { mutate: stub.mutate, mutateAsync: vi.fn(), isPending: stub.isPending };
  },
  usePillarUtils: () => ({
    invalidate: (path: readonly string[]) => {
      const key = path.join('.');
      if (key === 'ingredients.list') return mockInvalidateList();
      if (key === 'ingredients.get') return mockInvalidateGet();
      if (key === 'ingredients.blockers') return mockInvalidateBlockers();
      if (key === 'ingredients.tags.list') return mockInvalidateTagsList();
      if (key === 'ingredients.tags.distinct') return mockInvalidateTagsDistinct();
      return undefined;
    },
  }),
}));

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
  mockListQuery.mockReturnValue({ data: { items }, isLoading: false });
}

function seedDetail(ingredient: ListItem | null, variants: readonly VariantRow[] = []): void {
  mockGetQuery.mockImplementation((_: unknown, opts: { enabled?: boolean } | undefined) => {
    if (opts?.enabled === false) return { data: undefined, isLoading: false };
    if (ingredient === null) return { data: undefined, isLoading: true };
    return { data: { ingredient, variants }, isLoading: false };
  });
}

function renderWithRouter(initialPath = '/food/data/ingredients') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <IngredientsTab />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  resetStubs();
  mockBlockersQuery.mockReturnValue({ data: { variants: 0, aliases: 0 } });
  mockRecipeRefsQuery.mockReturnValue({
    data: { count: 0, recipes: [] },
    isLoading: false,
  });
  seedDetail(null);
});

describe('PRD-122-B — IngredientsTab', () => {
  it('renders the tree with children nested under their parent', () => {
    const fruit = row({ id: 1, slug: 'fruit', name: 'Fruit' });
    const banana = row({ id: 2, slug: 'banana', name: 'Banana', parentId: 1 });
    seedList([fruit, banana]);
    renderWithRouter();
    expect(screen.getByRole('tree', { name: /ingredient hierarchy/i })).toBeInTheDocument();
    expect(screen.getByText('Fruit')).toBeInTheDocument();
    expect(screen.queryByText('Banana')).not.toBeInTheDocument();
  });

  it('expanding a parent reveals its children', async () => {
    seedList([
      row({ id: 1, slug: 'fruit', name: 'Fruit' }),
      row({ id: 2, slug: 'banana', name: 'Banana', parentId: 1 }),
    ]);
    renderWithRouter();
    await userEvent.click(screen.getByRole('button', { name: /expand/i }));
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('selecting a node loads its detail panel', async () => {
    const apple = row({ id: 5, slug: 'apple', name: 'Apple', defaultUnit: 'g' });
    seedList([apple]);
    seedDetail(apple, []);
    renderWithRouter();
    await userEvent.click(screen.getByText('Apple'));
    expect(screen.getByRole('heading', { name: 'Apple', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('g', { selector: 'dd' })).toBeInTheDocument();
  });

  it('shows the empty state when no ingredients exist', () => {
    seedList([]);
    renderWithRouter();
    expect(screen.getByText(/no ingredients yet/i)).toBeInTheDocument();
  });

  it('opens the create dialog and submits a valid form', async () => {
    seedList([]);
    renderWithRouter();
    await userEvent.click(screen.getByRole('button', { name: /new ingredient/i }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^slug$/i), 'banana');
    await userEvent.type(within(dialog).getByLabelText(/^name$/i), 'Banana');
    await userEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));
    expect(stubs.createIngredient.mutate).toHaveBeenCalledWith({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
      parentId: null,
    });
  });

  it('surfaces a server-side error in the dialog', async () => {
    seedList([]);
    renderWithRouter();
    await userEvent.click(screen.getByRole('button', { name: /new ingredient/i }));
    await userEvent.type(screen.getByLabelText(/^slug$/i), 'banana');
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Banana');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    stubs.createIngredient.options.onError?.(
      new MockPillarCallError('food', {
        kind: 'conflict',
        pillar: 'food',
        message: 'Slug already registered',
      })
    );
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
    await userEvent.click(screen.getByText('Banana'));
    expect(screen.getByRole('heading', { name: /variants/i })).toBeInTheDocument();
    expect(screen.getAllByText(/fridge 7d/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/freezer 90d/i).length).toBeGreaterThan(0);
  });
});

describe('PRD-122-B2 — detail-panel CRUD', () => {
  function seedSelectedBanana(variants: readonly VariantRow[] = []) {
    const banana = row({ id: 5, slug: 'banana', name: 'Banana' });
    seedList([banana, row({ id: 6, slug: 'fruit', name: 'Fruit' })]);
    seedDetail(banana, variants);
    return banana;
  }

  it('rename dialog calls food.ingredients.rename with old + new slug', async () => {
    seedSelectedBanana();
    renderWithRouter();
    await userEvent.click(screen.getByText('Banana'));
    await userEvent.click(screen.getByRole('button', { name: /rename slug/i }));
    const dialog = screen.getByRole('dialog');
    const input = within(dialog).getByLabelText(/new slug/i);
    await userEvent.clear(input);
    await userEvent.type(input, 'bananas');
    await userEvent.click(within(dialog).getByRole('button', { name: /^rename$/i }));
    expect(stubs.renameIngredient.mutate).toHaveBeenCalledWith({
      oldSlug: 'banana',
      newSlug: 'bananas',
    });
  });

  it('change-parent dialog calls food.ingredients.changeParent', async () => {
    seedSelectedBanana();
    renderWithRouter();
    await userEvent.click(screen.getByText('Banana'));
    await userEvent.click(screen.getByRole('button', { name: /change parent/i }));
    const dialog = screen.getByRole('dialog');
    await userEvent.selectOptions(within(dialog).getByLabelText(/new parent/i), '6');
    await userEvent.click(within(dialog).getByRole('button', { name: /^move$/i }));
    expect(stubs.changeParent.mutate).toHaveBeenCalledWith({ id: 5, newParentId: 6 });
  });

  it('delete dialog disables Delete and lists blockers when variants exist', async () => {
    seedSelectedBanana();
    mockBlockersQuery.mockReturnValue({ data: { variants: 2, aliases: 0 } });
    renderWithRouter();
    await userEvent.click(screen.getByText('Banana'));
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i, hidden: false }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('alert')).toHaveTextContent(/2 variants/i);
    const deleteButton = within(dialog).getAllByRole('button', { name: /^delete$/i })[0];
    expect(deleteButton).toBeDisabled();
    expect(stubs.deleteIngredient.mutate).not.toHaveBeenCalled();
  });

  it('delete dialog fires food.ingredients.delete when blockers are zero', async () => {
    seedSelectedBanana();
    renderWithRouter();
    await userEvent.click(screen.getByText('Banana'));
    await userEvent.click(screen.getByRole('button', { name: /^delete$/i }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getAllByRole('button', { name: /^delete$/i })[0]);
    expect(stubs.deleteIngredient.mutate).toHaveBeenCalledWith({ id: 5 });
  });

  it('add-variant submits food.variants.create with the form values', async () => {
    seedSelectedBanana();
    renderWithRouter();
    await userEvent.click(screen.getByText('Banana'));
    await userEvent.click(screen.getByRole('button', { name: /add variant/i }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^slug$/i), 'raw');
    await userEvent.type(within(dialog).getByLabelText(/^name$/i), 'Raw');
    await userEvent.type(within(dialog).getByLabelText(/fridge/i), '7');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(stubs.createVariant.mutate).toHaveBeenCalledWith({
      ingredientId: 5,
      slug: 'raw',
      name: 'Raw',
      defaultUnit: 'count',
      packageSizeG: null,
      defaultShelfLifeDaysFridge: 7,
      defaultShelfLifeDaysFreezer: null,
      notes: null,
    });
  });

  it('edit-variant submits food.variants.update with the patched fields', async () => {
    const variant = variantRow({ id: 11, slug: 'raw', name: 'Raw' });
    seedSelectedBanana([variant]);
    renderWithRouter();
    await userEvent.click(screen.getByText('Banana'));
    await userEvent.click(screen.getAllByRole('button', { name: /edit raw/i })[0]);
    const dialog = screen.getByRole('dialog');
    const nameInput = within(dialog).getByLabelText(/^name$/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Fresh');
    await userEvent.click(within(dialog).getByRole('button', { name: /^save$/i }));
    expect(stubs.updateVariant.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 11, name: 'Fresh', slug: 'raw' })
    );
  });

  it('delete-variant confirm dispatches food.variants.delete', async () => {
    const variant = variantRow({ id: 11, slug: 'raw', name: 'Raw' });
    seedSelectedBanana([variant]);
    renderWithRouter();
    await userEvent.click(screen.getByText('Banana'));
    await userEvent.click(screen.getAllByRole('button', { name: /delete raw/i })[0]);
    const dialog = screen.getByRole('dialog');
    await userEvent.click(within(dialog).getAllByRole('button', { name: /^delete$/i })[0]);
    expect(stubs.deleteVariant.mutate).toHaveBeenCalledWith({ id: 11 });
  });

  it('shows the recipe-ref count when the query returns matches', async () => {
    const banana = seedSelectedBanana();
    mockRecipeRefsQuery.mockReturnValue({
      data: {
        count: 2,
        recipes: [
          { recipeId: 1, recipeSlug: 'smash-burger', recipeTitle: 'Smash burger' },
          { recipeId: 2, recipeSlug: 'banana-bread', recipeTitle: 'Banana bread' },
        ],
      },
      isLoading: false,
    });
    renderWithRouter();
    await userEvent.click(screen.getByText(banana.name));
    expect(screen.getByTestId('recipe-refs-count')).toHaveTextContent(/2 recipes/i);
    await userEvent.click(screen.getByRole('button', { name: /^show$/i }));
    expect(screen.getByText('Smash burger')).toBeInTheDocument();
    expect(screen.getByText('Banana bread')).toBeInTheDocument();
  });
});

describe('PRD-122-B2 — ?focus=<slug> deep-link', () => {
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
