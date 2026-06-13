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
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const mockDistinctUseQuery = vi.fn();
const mockFindByTagUseQuery = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown, opts: unknown) => {
    const key = path.join('.');
    if (key === 'ingredients.tags.distinct') return mockDistinctUseQuery(input);
    if (key === 'ingredients.tags.findByTag') return mockFindByTagUseQuery(input, opts);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
}));

import { TagsTab } from '../TagsTab.js';

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
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockFindByTagUseQuery.mockReturnValue({ data: { ingredients: [] }, isLoading: false });
});

describe('TagsTab', () => {
  it('renders the empty state when no tags exist', () => {
    mockDistinctUseQuery.mockReturnValue({ data: { tags: [] }, isLoading: false });
    render(
      <Wrapper>
        <TagsTab />
      </Wrapper>
    );
    expect(screen.getByTestId('tags-empty')).toBeInTheDocument();
  });

  it('groups tags by namespace', () => {
    mockDistinctUseQuery.mockReturnValue({
      data: {
        tags: [
          { tag: 'store-section:produce', ingredientCount: 3, firstSeenAt: '2026-06-10 12:00:00' },
          { tag: 'store-section:dairy', ingredientCount: 2, firstSeenAt: '2026-06-10 12:00:00' },
          { tag: 'diet:vegan', ingredientCount: 1, firstSeenAt: '2026-06-10 12:00:00' },
          { tag: 'plain', ingredientCount: 1, firstSeenAt: '2026-06-10 12:00:00' },
        ],
      },
      isLoading: false,
    });
    render(
      <Wrapper>
        <TagsTab />
      </Wrapper>
    );
    // Each namespace produces a heading; the (no namespace) bucket renders last.
    const headings = screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent);
    expect(headings).toEqual(['diet', 'store-section', '(no namespace)']);
    expect(screen.getByText('store-section:produce')).toBeInTheDocument();
    expect(screen.getByText('plain')).toBeInTheDocument();
  });

  it('renders the drill-down prompt by default', () => {
    mockDistinctUseQuery.mockReturnValue({
      data: {
        tags: [
          { tag: 'store-section:produce', ingredientCount: 1, firstSeenAt: '2026-06-10 12:00:00' },
        ],
      },
      isLoading: false,
    });
    render(
      <Wrapper>
        <TagsTab />
      </Wrapper>
    );
    expect(screen.getByText(/pick a tag on the left/i)).toBeInTheDocument();
  });

  it('clicking View on a row opens the drill-down panel', async () => {
    const user = userEvent.setup();
    mockDistinctUseQuery.mockReturnValue({
      data: {
        tags: [
          { tag: 'store-section:produce', ingredientCount: 2, firstSeenAt: '2026-06-10 12:00:00' },
        ],
      },
      isLoading: false,
    });
    mockFindByTagUseQuery.mockReturnValue({
      data: {
        ingredients: [
          { id: 1, slug: 'tomato', name: 'Tomato' },
          { id: 2, slug: 'onion', name: 'Onion' },
        ],
      },
      isLoading: false,
    });
    render(
      <Wrapper>
        <TagsTab />
      </Wrapper>
    );
    await user.click(screen.getByRole('button', { name: /view/i }));
    await waitFor(() => {
      expect(screen.getByText('Tomato')).toBeInTheDocument();
      expect(screen.getByText('Onion')).toBeInTheDocument();
    });
  });
});
