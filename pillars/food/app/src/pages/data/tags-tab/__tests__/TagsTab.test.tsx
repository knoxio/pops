/**
 * PRD-151 — TagsTab unit tests.
 *
 * Drives the read-only vocabulary view through synchronous tRPC stand-ins.
 * Asserts:
 *   - empty state when no tags
 *   - tags are grouped by namespace
 *   - `(no namespace)` bucket is rendered last
 *   - drill-down panel hits `findByTag` and lists the ingredients
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

interface TagDistinctRow {
  tag: string;
  ingredientCount: number;
  firstSeenAt: string;
}
interface IngredientSummary {
  id: number;
  slug: string;
  name: string;
}

const ingredientTagsDistinctMock = vi.hoisted(() => vi.fn());
const ingredientTagsByTagMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../food-api/index.js', () => ({
  ingredientTagsDistinct: ingredientTagsDistinctMock,
  ingredientTagsByTag: ingredientTagsByTagMock,
}));

import { TagsTab } from '../TagsTab.js';

function setDistinctTags(tags: TagDistinctRow[]): void {
  ingredientTagsDistinctMock.mockResolvedValue({ data: { tags } });
}
function setFindByTagIngredients(ingredients: IngredientSummary[]): void {
  ingredientTagsByTagMock.mockResolvedValue({ data: { ingredients } });
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
      <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  setFindByTagIngredients([]);
});

describe('TagsTab', () => {
  it('renders the empty state when no tags exist', async () => {
    setDistinctTags([]);
    render(
      <Wrapper>
        <TagsTab />
      </Wrapper>
    );
    expect(await screen.findByTestId('tags-empty')).toBeInTheDocument();
  });

  it('groups tags by namespace', async () => {
    setDistinctTags([
      { tag: 'store-section:produce', ingredientCount: 3, firstSeenAt: '2026-06-10 12:00:00' },
      { tag: 'store-section:dairy', ingredientCount: 2, firstSeenAt: '2026-06-10 12:00:00' },
      { tag: 'diet:vegan', ingredientCount: 1, firstSeenAt: '2026-06-10 12:00:00' },
      { tag: 'plain', ingredientCount: 1, firstSeenAt: '2026-06-10 12:00:00' },
    ]);
    render(
      <Wrapper>
        <TagsTab />
      </Wrapper>
    );
    // Each namespace produces a heading; the (no namespace) bucket renders last.
    await waitFor(() => {
      const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
      expect(headings).toEqual(['diet', 'store-section', '(no namespace)']);
    });
    expect(screen.getByText('store-section:produce')).toBeInTheDocument();
    expect(screen.getByText('plain')).toBeInTheDocument();
  });

  it('renders the drill-down prompt by default', async () => {
    setDistinctTags([
      { tag: 'store-section:produce', ingredientCount: 1, firstSeenAt: '2026-06-10 12:00:00' },
    ]);
    render(
      <Wrapper>
        <TagsTab />
      </Wrapper>
    );
    expect(await screen.findByText(/pick a tag on the left/i)).toBeInTheDocument();
  });

  it('clicking View on a row opens the drill-down panel', async () => {
    const user = userEvent.setup();
    setDistinctTags([
      { tag: 'store-section:produce', ingredientCount: 2, firstSeenAt: '2026-06-10 12:00:00' },
    ]);
    setFindByTagIngredients([
      { id: 1, slug: 'tomato', name: 'Tomato' },
      { id: 2, slug: 'onion', name: 'Onion' },
    ]);
    render(
      <Wrapper>
        <TagsTab />
      </Wrapper>
    );
    await user.click(await screen.findByRole('button', { name: /view/i }));
    await waitFor(() => {
      expect(screen.getByText('Tomato')).toBeInTheDocument();
      expect(screen.getByText('Onion')).toBeInTheDocument();
    });
  });
});
