/**
 * PRD-122-B — ingredients tab UI smoke tests.
 *
 * Mocks `@pops/api-client` so the tree renders against a controlled
 * dataset; asserts:
 *   - the tree groups children under their parents
 *   - selecting a node renders the detail panel
 *   - the create dialog opens and submits via the mutation
 *   - the create dialog surfaces a server error
 */
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { IngredientsTab } from '../../IngredientsTab';

const mockListQuery = vi.fn();
const mockGetQuery = vi.fn();
const mockMutate = vi.fn();
let mutationOptions: { onSuccess?: () => void; onError?: (err: { message: string }) => void } = {};
const mockInvalidate = vi.fn();
const mockUtilsList = { invalidate: mockInvalidate };

vi.mock('@pops/api-client', () => ({
  trpc: {
    food: {
      ingredients: {
        list: { useQuery: (input: unknown) => mockListQuery(input) },
        get: {
          useQuery: (input: unknown, opts: unknown) => mockGetQuery(input, opts),
        },
        create: {
          useMutation: (opts: typeof mutationOptions) => {
            mutationOptions = opts;
            return { mutate: mockMutate, isPending: false };
          },
        },
      },
    },
    useUtils: () => ({ food: { ingredients: { list: mockUtilsList } } }),
  },
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

function seedList(items: readonly ListItem[]): void {
  mockListQuery.mockReturnValue({ data: { items }, isLoading: false });
}

function seedDetail(ingredient: ListItem | null, variants: readonly unknown[] = []): void {
  mockGetQuery.mockImplementation((_, opts: { enabled?: boolean } | undefined) => {
    if (opts?.enabled === false) return { data: undefined, isLoading: false };
    if (ingredient === null) return { data: undefined, isLoading: true };
    return { data: { ingredient, variants }, isLoading: false };
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mutationOptions = {};
  seedDetail(null);
});

describe('PRD-122-B — IngredientsTab', () => {
  it('renders the tree with children nested under their parent', () => {
    const fruit = row({ id: 1, slug: 'fruit', name: 'Fruit' });
    const banana = row({ id: 2, slug: 'banana', name: 'Banana', parentId: 1 });
    seedList([fruit, banana]);
    render(<IngredientsTab />);
    expect(screen.getByRole('tree', { name: /ingredient hierarchy/i })).toBeInTheDocument();
    expect(screen.getByText('Fruit')).toBeInTheDocument();
    // Banana is nested — not visible until Fruit expands.
    expect(screen.queryByText('Banana')).not.toBeInTheDocument();
  });

  it('expanding a parent reveals its children', async () => {
    seedList([
      row({ id: 1, slug: 'fruit', name: 'Fruit' }),
      row({ id: 2, slug: 'banana', name: 'Banana', parentId: 1 }),
    ]);
    render(<IngredientsTab />);
    const expandButton = screen.getByRole('button', { name: /expand/i });
    await userEvent.click(expandButton);
    expect(screen.getByText('Banana')).toBeInTheDocument();
  });

  it('selecting a node loads its detail panel', async () => {
    const apple = row({ id: 5, slug: 'apple', name: 'Apple', defaultUnit: 'g' });
    seedList([apple]);
    seedDetail(apple, []);
    render(<IngredientsTab />);
    await userEvent.click(screen.getByText('Apple'));
    expect(screen.getByRole('heading', { name: 'Apple', level: 2 })).toBeInTheDocument();
    expect(screen.getByText(/default unit/i)).toBeInTheDocument();
    expect(screen.getByText('g', { selector: 'dd' })).toBeInTheDocument();
  });

  it('shows the empty state when no ingredients exist', () => {
    seedList([]);
    render(<IngredientsTab />);
    expect(screen.getByText(/no ingredients yet/i)).toBeInTheDocument();
  });

  it('opens the create dialog and submits a valid form', async () => {
    seedList([]);
    render(<IngredientsTab />);
    await userEvent.click(screen.getByRole('button', { name: /new ingredient/i }));
    const dialog = screen.getByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText(/^slug$/i), 'banana');
    await userEvent.type(within(dialog).getByLabelText(/^name$/i), 'Banana');
    await userEvent.click(within(dialog).getByRole('button', { name: /^create$/i }));
    expect(mockMutate).toHaveBeenCalledWith({
      slug: 'banana',
      name: 'Banana',
      defaultUnit: 'count',
      parentId: null,
    });
  });

  it('surfaces a server-side error in the dialog', async () => {
    seedList([]);
    render(<IngredientsTab />);
    await userEvent.click(screen.getByRole('button', { name: /new ingredient/i }));
    await userEvent.type(screen.getByLabelText(/^slug$/i), 'banana');
    await userEvent.type(screen.getByLabelText(/^name$/i), 'Banana');
    await userEvent.click(screen.getByRole('button', { name: /^create$/i }));
    mutationOptions.onError?.({ message: 'Slug already registered' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/slug already registered/i);
  });

  it('renders embedded variants when the detail returns any', async () => {
    const banana = row({ id: 5, slug: 'banana', name: 'Banana' });
    seedList([banana]);
    seedDetail(banana, [
      {
        id: 11,
        ingredientId: 5,
        slug: 'raw',
        name: 'Raw',
        defaultUnit: 'count',
        packageSizeG: null,
        defaultShelfLifeDaysFridge: 7,
        defaultShelfLifeDaysFreezer: 90,
        notes: null,
        createdAt: '2026-01-01',
      },
    ]);
    render(<IngredientsTab />);
    await userEvent.click(screen.getByText('Banana'));
    expect(screen.getByRole('heading', { name: /variants/i })).toBeInTheDocument();
    expect(screen.getByText(/fridge 7d/i)).toBeInTheDocument();
    expect(screen.getByText(/freezer 90d/i)).toBeInTheDocument();
  });
});
