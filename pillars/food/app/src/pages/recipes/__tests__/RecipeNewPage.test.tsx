import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

const recipesCreateMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  recipesCreate: recipesCreateMock,
}));

vi.mock('../../../components/DslEditor.js', () => ({
  DslEditor: (props: { initialValue: string; onChange: (v: string) => void; issues?: unknown }) => (
    <div data-testid="dsl-editor" data-issues={JSON.stringify(props.issues ?? [])}>
      <textarea
        defaultValue={props.initialValue}
        onChange={(e) => props.onChange(e.target.value)}
        aria-label="dsl editor"
      />
    </div>
  ),
}));

const navigateMock = vi.fn();
vi.mock('react-router', async (orig) => {
  const actual = await orig<typeof import('react-router')>();
  return { ...actual, useNavigate: () => navigateMock };
});

import { RecipeNewPage } from '../RecipeNewPage.js';

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
    () =>
      new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
      }),
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
  recipesCreateMock.mockReset();
  navigateMock.mockReset();
});

describe('recipe-crud-pages — RecipeNewPage', () => {
  it('renders the editor + save CTA', () => {
    render(
      <Wrapper>
        <RecipeNewPage />
      </Wrapper>
    );
    expect(screen.getByRole('heading', { name: /new recipe/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save draft/i })).toBeInTheDocument();
    expect(screen.getByTestId('dsl-editor')).toBeInTheDocument();
  });

  it('passes the current DSL value to the create mutation on save', async () => {
    const user = userEvent.setup();
    recipesCreateMock.mockResolvedValue({
      data: { slug: 'pancakes', recipeId: 1, versionId: 11, compile: { ok: true } },
    });
    render(
      <Wrapper>
        <RecipeNewPage />
      </Wrapper>
    );
    const textarea = screen.getByLabelText(/dsl editor/i);
    await user.clear(textarea);
    await user.type(textarea, '@recipe(slug=\\"pancakes\\")');
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() =>
      expect(recipesCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ dsl: expect.stringContaining('pancakes') }),
        })
      )
    );
  });

  it('navigates to the edit page on success', async () => {
    const user = userEvent.setup();
    recipesCreateMock.mockResolvedValue({
      data: { slug: 'pancakes', recipeId: 1, versionId: 11, compile: { ok: true } },
    });
    render(
      <Wrapper>
        <RecipeNewPage />
      </Wrapper>
    );
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/food/recipes/pancakes/edit'));
  });

  it('surfaces inline compile issues and still navigates on a failed compile', async () => {
    const user = userEvent.setup();
    recipesCreateMock.mockResolvedValue({
      data: {
        slug: 'pancakes',
        recipeId: 1,
        versionId: 11,
        compile: {
          ok: false,
          phase: 'parse',
          errors: [{ code: 'ParseError', message: 'bad token' }],
        },
      },
    });
    render(
      <Wrapper>
        <RecipeNewPage />
      </Wrapper>
    );
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/food/recipes/pancakes/edit'));
    expect(screen.getByTestId('dsl-editor').getAttribute('data-issues')).toContain('bad token');
  });

  it('does not navigate when the create call fails', async () => {
    const user = userEvent.setup();
    recipesCreateMock.mockResolvedValue({ error: { message: 'boom' }, response: { status: 500 } });
    render(
      <Wrapper>
        <RecipeNewPage />
      </Wrapper>
    );
    await user.click(screen.getByRole('button', { name: /save draft/i }));
    await waitFor(() => expect(recipesCreateMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
