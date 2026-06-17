import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

import type { RecipeVersionWithCompiledData } from '@pops/app-food-db';

const recipesGetForRenderingMock = vi.hoisted(() => vi.fn());
const recipesListDraftsMock = vi.hoisted(() => vi.fn());
const recipesArchiveRecipeMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  recipesGetForRendering: recipesGetForRenderingMock,
  recipesListDrafts: recipesListDraftsMock,
  recipesArchiveRecipe: recipesArchiveRecipeMock,
}));

vi.mock('../../../components/RecipeRenderer.js', () => ({
  RecipeRenderer: (props: { recipeVersion: RecipeVersionWithCompiledData }) => (
    <div data-testid="renderer-stub">{props.recipeVersion.recipe.slug}</div>
  ),
}));

const navigateMock = vi.fn();
vi.mock('react-router', async (orig) => {
  const actual = await orig<typeof import('react-router')>();
  return {
    ...actual,
    useNavigate: () => navigateMock,
    useParams: () => ({ slug: 'pancakes' }),
  };
});

import { RecipeDetailPage } from '../RecipeDetailPage.js';

function makePayload(
  overrides: Partial<RecipeVersionWithCompiledData> = {}
): RecipeVersionWithCompiledData {
  const recipe = {
    id: 1,
    slug: 'pancakes',
    recipeType: 'plate' as const,
    currentVersionId: 11,
    heroImagePath: null,
    archivedAt: null,
    createdAt: '2026-01-01',
  };
  const version = {
    id: 11,
    recipeId: 1,
    versionNo: 1,
    status: 'current' as const,
    title: 'Banana pancakes',
    summary: null,
    bodyDsl: '',
    yieldIngredientId: null,
    yieldVariantId: null,
    yieldPrepStateId: null,
    yieldQty: null,
    yieldUnit: null,
    servings: null,
    prepMinutes: null,
    cookMinutes: null,
    sourceId: null,
    compileStatus: 'compiled' as const,
    compileError: null,
    compiledAt: '2026-01-01',
    createdAt: '2026-01-01',
  };
  return {
    recipe,
    version,
    lines: [],
    steps: [],
    yieldIngredient: null,
    yieldVariant: null,
    yieldPrepState: null,
    tags: [],
    ...overrides,
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
  recipesGetForRenderingMock.mockReset();
  recipesListDraftsMock.mockReset();
  recipesArchiveRecipeMock.mockReset();
  navigateMock.mockReset();
  recipesListDraftsMock.mockResolvedValue({ data: { drafts: [] } });
});

describe('PRD-119-B — RecipeDetailPage', () => {
  it('shows the loading state while the query resolves', () => {
    recipesGetForRenderingMock.mockReturnValue(new Promise(() => {}));
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading recipe/i);
  });

  it('renders the RecipeRenderer stub when the query resolves', async () => {
    recipesGetForRenderingMock.mockResolvedValue({ data: makePayload() });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    expect(await screen.findByTestId('renderer-stub')).toHaveTextContent('pancakes');
  });

  it('routes NOT_FOUND errors to the not-found shell', async () => {
    recipesGetForRenderingMock.mockResolvedValue({
      error: { message: 'Recipe "ghost" not found' },
      response: { status: 404 },
    });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/recipe not found/i);
  });

  it('renders the action menu with the draft count surfaced', async () => {
    recipesGetForRenderingMock.mockResolvedValue({ data: makePayload() });
    recipesListDraftsMock.mockResolvedValue({
      data: {
        drafts: [
          { versionId: 1, versionNo: 1, title: 'a', compileStatus: 'compiled', createdAt: 'x', preview: '' },
          { versionId: 2, versionNo: 2, title: 'b', compileStatus: 'compiled', createdAt: 'x', preview: '' },
        ],
      },
    });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    await screen.findByTestId('renderer-stub');
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    expect(screen.getByText(/drafts.*2/i)).toBeInTheDocument();
  });

  it('opens the archive dialog from the menu and fires the mutation on confirm', async () => {
    recipesGetForRenderingMock.mockResolvedValue({ data: makePayload() });
    recipesArchiveRecipeMock.mockResolvedValue({ data: { ok: true } });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    await screen.findByTestId('renderer-stub');
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /archive/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/type "archive"/i), 'archive');
    await userEvent.click(screen.getByRole('button', { name: /archive recipe/i }));
    await waitFor(() =>
      expect(recipesArchiveRecipeMock).toHaveBeenCalledWith({ path: { slug: 'pancakes' } })
    );
  });

  it('navigates back to the list page on archive success', async () => {
    recipesGetForRenderingMock.mockResolvedValue({ data: makePayload() });
    recipesArchiveRecipeMock.mockResolvedValue({ data: { ok: true } });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    await screen.findByTestId('renderer-stub');
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /archive/i }));
    await userEvent.type(screen.getByLabelText(/type "archive"/i), 'archive');
    await userEvent.click(screen.getByRole('button', { name: /archive recipe/i }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/food/recipes'));
  });

  it('surfaces the toast errors path when archive fails', async () => {
    recipesGetForRenderingMock.mockResolvedValue({ data: makePayload() });
    recipesArchiveRecipeMock.mockResolvedValue({
      error: { message: 'boom' },
      response: { status: 500 },
    });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    await screen.findByTestId('renderer-stub');
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /archive/i }));
    await userEvent.type(screen.getByLabelText(/type "archive"/i), 'archive');
    await userEvent.click(screen.getByRole('button', { name: /archive recipe/i }));
    await waitFor(() => expect(recipesArchiveRecipeMock).toHaveBeenCalledTimes(1));
    expect(navigateMock).not.toHaveBeenCalled();
  });
});
