import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

import type { RecipeListItemView } from '../useRecipeListQuery.js';

const mockListInfinite = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarInfiniteQuery: (
    _pillarId: string,
    path: readonly string[],
    input: unknown,
    opts: unknown
  ) => {
    const key = path.join('.');
    if (key === 'recipes.list') return mockListInfinite(input, opts);
    throw new Error(`Unexpected pillar infinite query: ${key}`);
  },
}));

import { RecipeListPage } from '../RecipeListPage.js';

function buildItem(overrides: Partial<RecipeListItemView> = {}): RecipeListItemView {
  return {
    slug: 'pancakes',
    title: 'Banana pancakes',
    recipeType: 'plate',
    heroImagePath: null,
    prepMinutes: 5,
    cookMinutes: 10,
    servings: 2,
    tags: ['breakfast'],
    hasCurrentVersion: true,
    archivedAt: null,
    createdAt: '2026-01-01',
    ...overrides,
  };
}

function makeQueryResult(opts: {
  items?: RecipeListItemView[];
  isLoading?: boolean;
  hasNextPage?: boolean;
  error?: Error | null;
}) {
  const items = opts.items ?? [];
  return {
    data: items.length === 0 ? undefined : { pages: [{ items, nextCursor: undefined }] },
    isLoading: opts.isLoading ?? false,
    isFetchingNextPage: false,
    hasNextPage: opts.hasNextPage ?? false,
    fetchNextPage: vi.fn(),
    refetch: vi.fn(),
    error: opts.error ?? null,
  };
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

beforeEach(() => {
  mockListInfinite.mockReset();
});

describe('PRD-119-A — RecipeListPage', () => {
  it('renders the empty state CTA when there are zero rows', () => {
    mockListInfinite.mockReturnValue(makeQueryResult({ items: [] }));
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /create your first recipe/i }).length
    ).toBeGreaterThan(0);
  });

  it('renders a card per row and includes the new-recipe CTA', () => {
    mockListInfinite.mockReturnValue(
      makeQueryResult({ items: [buildItem(), buildItem({ slug: 'crepes', title: 'Crêpes' })] })
    );
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(screen.getByRole('heading', { name: /^Recipes$/, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /banana pancakes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /crêpes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+ new recipe/i })).toBeInTheDocument();
  });

  it('shows the draft-only badge when the recipe has no current version', () => {
    mockListInfinite.mockReturnValue(
      makeQueryResult({ items: [buildItem({ hasCurrentVersion: false })] })
    );
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(screen.getByText(/draft only/i)).toBeInTheDocument();
  });

  it('shows the archived badge when archivedAt is set', () => {
    mockListInfinite.mockReturnValue(
      makeQueryResult({ items: [buildItem({ archivedAt: '2026-01-01' })] })
    );
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(screen.getByText(/^archived$/i)).toBeInTheDocument();
  });

  it('shows a loading state while the first page resolves', () => {
    mockListInfinite.mockReturnValue(makeQueryResult({ isLoading: true }));
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(screen.getByText(/loading recipes/i)).toBeInTheDocument();
  });

  it('renders the error state with a retry button', async () => {
    const refetch = vi.fn();
    mockListInfinite.mockReturnValue({
      ...makeQueryResult({ error: new Error('boom') }),
      refetch,
    });
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/could not load recipes/i);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders the "Load more" CTA when hasNextPage is true', async () => {
    const fetchNextPage = vi.fn();
    mockListInfinite.mockReturnValue({
      ...makeQueryResult({ items: [buildItem()], hasNextPage: true }),
      fetchNextPage,
    });
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    const button = await screen.findByRole('button', { name: /load more/i });
    await userEvent.click(button);
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it('debounces the search input before calling the query', async () => {
    mockListInfinite.mockReturnValue(makeQueryResult({ items: [buildItem()] }));
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    const input = screen.getByRole('searchbox', { name: /search recipes/i });
    await userEvent.type(input, 'pan');
    // The hook only receives the new search after the debounce window.
    await waitFor(() =>
      expect(mockListInfinite).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'pan' }),
        expect.anything()
      )
    );
  });
});
