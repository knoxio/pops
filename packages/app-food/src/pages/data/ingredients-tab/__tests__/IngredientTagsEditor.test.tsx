/**
 * PRD-151 — IngredientTagsEditor unit tests.
 *
 * Mocks `@pops/api-client` so the component is exercised against a fully
 * synchronous tRPC stand-in. Covers:
 *   - initial render hydrates from the server-side list
 *   - adding a chip is local until Save
 *   - removing a chip toggles dirty + the Save button
 *   - autocomplete suggestions come from `distinct`
 *   - server-side BadTagFormat surfaces inline (no thrown error)
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const mockListUseQuery = vi.fn();
const mockDistinctUseQuery = vi.fn();
const mockSetMutate = vi.fn();
const mockSetUseMutation = vi.fn();
const mockInvalidate = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'ingredients.tags.list') return mockListUseQuery(input);
    if (key === 'ingredients.tags.distinct') return mockDistinctUseQuery(input);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (_pillarId: string, path: readonly string[], opts: unknown) => {
    const key = path.join('.');
    if (key === 'ingredients.tags.set') return mockSetUseMutation(opts);
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    invalidate: mockInvalidate,
  }),
}));

import { IngredientTagsEditor } from '../IngredientTagsEditor.js';

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
  mockListUseQuery.mockReturnValue({ data: { tags: [] }, isLoading: false });
  mockDistinctUseQuery.mockReturnValue({ data: { tags: [] } });
  mockSetUseMutation.mockReturnValue({
    mutate: mockSetMutate,
    isPending: false,
  });
});

describe('IngredientTagsEditor', () => {
  it('renders the empty state when the ingredient has no tags', () => {
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    expect(screen.getByText(/no tags yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('hydrates from the server-side list', () => {
    mockListUseQuery.mockReturnValue({
      data: { tags: ['diet:vegan', 'store-section:produce'] },
      isLoading: false,
    });
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    expect(screen.getByText('diet:vegan')).toBeInTheDocument();
    expect(screen.getByText('store-section:produce')).toBeInTheDocument();
  });

  it('adding a tag enables Save', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    await user.type(screen.getByLabelText(/new tag/i), 'store-section:produce');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(screen.getByText('store-section:produce')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).not.toBeDisabled();
  });

  it('Enter key adds the typed tag', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    const input = screen.getByLabelText(/new tag/i);
    await user.type(input, 'diet:vegan{Enter}');
    expect(screen.getByText('diet:vegan')).toBeInTheDocument();
  });

  it('clicking Save invokes the mutation with the dirty set', async () => {
    const user = userEvent.setup();
    mockListUseQuery.mockReturnValue({ data: { tags: ['old:one'] }, isLoading: false });
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={42} />
      </Wrapper>
    );
    await user.type(screen.getByLabelText(/new tag/i), 'diet:vegan');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    expect(mockSetMutate).toHaveBeenCalledWith(
      { ingredientId: 42, tags: ['old:one', 'diet:vegan'] },
      expect.objectContaining({ onSuccess: expect.any(Function) })
    );
  });

  it('Reset returns to the server-side set', async () => {
    const user = userEvent.setup();
    mockListUseQuery.mockReturnValue({ data: { tags: ['kept:one'] }, isLoading: false });
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    await user.type(screen.getByLabelText(/new tag/i), 'diet:vegan');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(screen.getByText('diet:vegan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.queryByText('diet:vegan')).not.toBeInTheDocument();
    expect(screen.getByText('kept:one')).toBeInTheDocument();
  });

  it('autocomplete suggestions surface in the datalist', () => {
    mockDistinctUseQuery.mockReturnValue({
      data: {
        tags: [
          { tag: 'store-section:produce', ingredientCount: 3, firstSeenAt: '2026-06-10' },
          { tag: 'diet:vegan', ingredientCount: 1, firstSeenAt: '2026-06-10' },
        ],
      },
    });
    const { container } = render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    const datalist = container.querySelector('datalist');
    expect(datalist).not.toBeNull();
    const options = datalist?.querySelectorAll('option') ?? [];
    expect(options).toHaveLength(2);
    expect(options[0]?.getAttribute('value')).toBe('store-section:produce');
  });

  it('surfaces BadTagFormat from the server inline', async () => {
    const user = userEvent.setup();
    mockSetMutate.mockImplementation((_input, opts: { onSuccess: (r: unknown) => void }) => {
      opts.onSuccess({ ok: false, reason: 'BadTagFormat' });
    });
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    await user.type(screen.getByLabelText(/new tag/i), 'has space');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/lowercase/i);
    });
  });
});
