import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import { initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

import type { RecipeListItemView } from '../useRecipeListQuery.js';

const recipesListMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  recipesList: recipesListMock,
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

function resolvePage(items: RecipeListItemView[], nextCursor: string | null = null): void {
  recipesListMock.mockResolvedValue({ data: { items, nextCursor } });
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
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
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

beforeEach(() => {
  recipesListMock.mockReset();
  resolvePage([]);
});

describe('PRD-119-A — RecipeListPage', () => {
  it('renders the empty state CTA when there are zero rows', async () => {
    resolvePage([]);
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(await screen.findByText(/no recipes yet/i)).toBeInTheDocument();
    expect(
      screen.getAllByRole('link', { name: /create your first recipe/i }).length
    ).toBeGreaterThan(0);
  });

  it('renders a card per row and includes the new-recipe CTA', async () => {
    resolvePage([buildItem(), buildItem({ slug: 'crepes', title: 'Crêpes' })]);
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(await screen.findByRole('link', { name: /banana pancakes/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /^Recipes$/, level: 1 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /crêpes/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /\+ new recipe/i })).toBeInTheDocument();
  });

  it('shows the draft-only badge when the recipe has no current version', async () => {
    resolvePage([buildItem({ hasCurrentVersion: false })]);
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(await screen.findByText(/draft only/i)).toBeInTheDocument();
  });

  it('shows the archived badge when archivedAt is set', async () => {
    resolvePage([buildItem({ archivedAt: '2026-01-01' })]);
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(await screen.findByText(/^archived$/i)).toBeInTheDocument();
  });

  it('shows a loading state while the first page resolves', () => {
    recipesListMock.mockReturnValue(new Promise(() => {}));
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(screen.getByText(/loading recipes/i)).toBeInTheDocument();
  });

  it('renders the error state with a retry button', async () => {
    recipesListMock.mockResolvedValue({ error: { message: 'boom' }, response: { status: 500 } });
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load recipes/i);
    recipesListMock.mockResolvedValue({ data: { items: [buildItem()], nextCursor: null } });
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(await screen.findByRole('link', { name: /banana pancakes/i })).toBeInTheDocument();
  });

  it('renders the "Load more" CTA when hasNextPage is true', async () => {
    resolvePage([buildItem()], 'cursor-2');
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    const button = await screen.findByRole('button', { name: /load more/i });
    await userEvent.click(button);
    await waitFor(() =>
      expect(recipesListMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ cursor: 'cursor-2' }) })
      )
    );
  });

  it('debounces the search input before calling the query', async () => {
    resolvePage([buildItem()]);
    render(
      <Wrapper>
        <RecipeListPage />
      </Wrapper>
    );
    const input = screen.getByRole('searchbox', { name: /search recipes/i });
    await userEvent.type(input, 'pan');
    await waitFor(() =>
      expect(recipesListMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ search: 'pan' }) })
      )
    );
  });
});
