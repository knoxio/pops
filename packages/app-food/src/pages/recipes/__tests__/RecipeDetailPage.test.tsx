import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

import type { RecipeVersionWithCompiledData } from '@pops/app-food-db';

const mockGet = vi.fn();
const mockDrafts = vi.fn();
const mockArchiveMutate = vi.fn();
let mockArchivePending = false;
let mockArchiveOnSuccess: (() => void) | undefined;
let mockArchiveOnError: ((err: Error) => void) | undefined;

const idleQuery = {
  isLoading: false as const,
  data: undefined,
  error: null,
  refetch: vi.fn(),
};

vi.mock('@pops/api-client', () => ({
  trpc: {
    food: {
      recipes: {
        prepareSendToList: { useQuery: () => idleQuery },
      },
    },
    lists: {
      list: {
        list: { useQuery: () => idleQuery },
      },
    },
  },
}));

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'recipes.getForRendering') return mockGet(input);
    if (key === 'recipes.listDrafts') return mockDrafts(input);
    return { isLoading: false, data: undefined, error: null, refetch: vi.fn() };
  },
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: { onSuccess?: () => void; onError?: (err: Error) => void }
  ) => {
    const key = path.join('.');
    if (key === 'recipes.archiveRecipe') {
      mockArchiveOnSuccess = opts.onSuccess;
      mockArchiveOnError = opts.onError;
      return { mutate: mockArchiveMutate, isPending: mockArchivePending };
    }
    return { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false };
  },
  usePillarUtils: () => ({
    invalidate: vi.fn(),
    setData: vi.fn(),
  }),
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
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nextProvider>
  );
}

beforeEach(() => {
  mockGet.mockReset();
  mockDrafts.mockReset();
  mockArchiveMutate.mockReset();
  navigateMock.mockReset();
  mockArchivePending = false;
});

describe('PRD-119-B — RecipeDetailPage', () => {
  it('shows the loading state while the query resolves', () => {
    mockGet.mockReturnValue({ isLoading: true, data: undefined, error: null, refetch: vi.fn() });
    mockDrafts.mockReturnValue({ data: undefined, error: null, refetch: vi.fn() });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading recipe/i);
  });

  it('renders the RecipeRenderer stub when the query resolves', () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: makePayload(),
      error: null,
      refetch: vi.fn(),
    });
    mockDrafts.mockReturnValue({ data: { drafts: [] }, error: null, refetch: vi.fn() });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    expect(screen.getByTestId('renderer-stub')).toHaveTextContent('pancakes');
  });

  it('routes NOT_FOUND errors to the not-found shell', () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: undefined,
      error: new Error('Recipe "ghost" not found'),
      refetch: vi.fn(),
    });
    mockDrafts.mockReturnValue({ data: { drafts: [] }, error: null, refetch: vi.fn() });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/recipe not found/i);
  });

  it('renders the action menu with the draft count surfaced', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: makePayload(),
      error: null,
      refetch: vi.fn(),
    });
    mockDrafts.mockReturnValue({
      data: { drafts: [{ versionId: 1 }, { versionId: 2 }] },
      error: null,
      refetch: vi.fn(),
    });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    expect(screen.getByText(/drafts.*2/i)).toBeInTheDocument();
  });

  it('opens the archive dialog from the menu and fires the mutation on confirm', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: makePayload(),
      error: null,
      refetch: vi.fn(),
    });
    mockDrafts.mockReturnValue({ data: { drafts: [] }, error: null, refetch: vi.fn() });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    await userEvent.click(screen.getByRole('button', { name: /actions/i }));
    await userEvent.click(screen.getByRole('menuitem', { name: /archive/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/type "archive"/i), 'archive');
    await userEvent.click(screen.getByRole('button', { name: /archive recipe/i }));
    expect(mockArchiveMutate).toHaveBeenCalledWith({ slug: 'pancakes' });
  });

  it('navigates back to the list page on archive success', async () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: makePayload(),
      error: null,
      refetch: vi.fn(),
    });
    mockDrafts.mockReturnValue({ data: { drafts: [] }, error: null, refetch: vi.fn() });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    // Mounting registers the callback; invoking it should trigger the
    // navigate side-effect.
    expect(mockArchiveOnSuccess).toBeDefined();
    mockArchiveOnSuccess?.();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/food/recipes'));
  });

  it('surfaces the toast errors path via the mutation onError hook', () => {
    mockGet.mockReturnValue({
      isLoading: false,
      data: makePayload(),
      error: null,
      refetch: vi.fn(),
    });
    mockDrafts.mockReturnValue({ data: { drafts: [] }, error: null, refetch: vi.fn() });
    render(
      <Wrapper>
        <RecipeDetailPage />
      </Wrapper>
    );
    expect(mockArchiveOnError).toBeDefined();
    // Calling it should not throw — covers the error branch.
    expect(() => mockArchiveOnError?.(new Error('boom'))).not.toThrow();
  });
});
