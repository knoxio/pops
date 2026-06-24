/**
 * Mocks the generated food SDK so the component is exercised against a
 * controlled stand-in.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

const ingredientTagsListMock = vi.hoisted(() => vi.fn());
const ingredientTagsDistinctMock = vi.hoisted(() => vi.fn());
const ingredientTagsSetMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../food-api/index.js', () => ({
  ingredientTagsList: ingredientTagsListMock,
  ingredientTagsDistinct: ingredientTagsDistinctMock,
  ingredientTagsSet: ingredientTagsSetMock,
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
  ingredientTagsListMock.mockResolvedValue({ data: { tags: [] } });
  ingredientTagsDistinctMock.mockResolvedValue({ data: { tags: [] } });
  ingredientTagsSetMock.mockResolvedValue({ data: { ok: true } });
});

describe('IngredientTagsEditor', () => {
  it('renders the empty state when the ingredient has no tags', async () => {
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    expect(await screen.findByText(/no tags yet/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('hydrates from the server-side list', async () => {
    ingredientTagsListMock.mockResolvedValue({
      data: { tags: ['diet:vegan', 'store-section:produce'] },
    });
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    expect(await screen.findByText('diet:vegan')).toBeInTheDocument();
    expect(screen.getByText('store-section:produce')).toBeInTheDocument();
  });

  it('adding a tag enables Save', async () => {
    const user = userEvent.setup();
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    await user.type(await screen.findByLabelText(/new tag/i), 'store-section:produce');
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
    const input = await screen.findByLabelText(/new tag/i);
    await user.type(input, 'diet:vegan{Enter}');
    expect(screen.getByText('diet:vegan')).toBeInTheDocument();
  });

  it('clicking Save invokes the mutation with the dirty set', async () => {
    const user = userEvent.setup();
    ingredientTagsListMock.mockResolvedValue({ data: { tags: ['old:one'] } });
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={42} />
      </Wrapper>
    );
    expect(await screen.findByText('old:one')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/new tag/i), 'diet:vegan');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(ingredientTagsSetMock).toHaveBeenCalledWith({
        path: { ingredientId: 42 },
        body: { tags: ['old:one', 'diet:vegan'] },
      });
    });
  });

  it('Reset returns to the server-side set', async () => {
    const user = userEvent.setup();
    ingredientTagsListMock.mockResolvedValue({ data: { tags: ['kept:one'] } });
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    expect(await screen.findByText('kept:one')).toBeInTheDocument();
    await user.type(screen.getByLabelText(/new tag/i), 'diet:vegan');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    expect(screen.getByText('diet:vegan')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /reset/i }));
    expect(screen.queryByText('diet:vegan')).not.toBeInTheDocument();
    expect(screen.getByText('kept:one')).toBeInTheDocument();
  });

  it('autocomplete suggestions surface in the datalist', async () => {
    ingredientTagsDistinctMock.mockResolvedValue({
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
    await waitFor(() => {
      expect(container.querySelectorAll('datalist option')).toHaveLength(2);
    });
    const options = container.querySelectorAll('datalist option');
    expect(options[0]?.getAttribute('value')).toBe('store-section:produce');
  });

  it('surfaces BadTagFormat from the server inline', async () => {
    const user = userEvent.setup();
    ingredientTagsSetMock.mockResolvedValue({ data: { ok: false, reason: 'BadTagFormat' } });
    render(
      <Wrapper>
        <IngredientTagsEditor ingredientId={1} />
      </Wrapper>
    );
    await user.type(await screen.findByLabelText(/new tag/i), 'has space');
    await user.click(screen.getByRole('button', { name: /^add$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(/lowercase/i);
    });
  });
});
