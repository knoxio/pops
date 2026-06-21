/**
 * PRD-124 follow-up — verifies the `RecipeEditPage` recipe edit shell
 * mounts the `HeroImageUploader` with the recipe's id + heroImagePath,
 * and that the upload/remove callbacks invalidate the rendering query
 * so the new path round-trips into the editor surface.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const recipesCreateNewDraftMock = vi.hoisted(() => vi.fn());
const recipesGetForRenderingMock = vi.hoisted(() => vi.fn());
const recipesListProposedSlugsMock = vi.hoisted(() => vi.fn());
const recipesSaveDraftMock = vi.hoisted(() => vi.fn());
const recipesPromoteMock = vi.hoisted(() => vi.fn());
const recipesArchiveVersionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  recipesCreateNewDraft: recipesCreateNewDraftMock,
  recipesGetForRendering: recipesGetForRenderingMock,
  recipesListProposedSlugs: recipesListProposedSlugsMock,
  recipesSaveDraft: recipesSaveDraftMock,
  recipesPromote: recipesPromoteMock,
  recipesArchiveVersion: recipesArchiveVersionMock,
}));

vi.mock('../../../components/DslEditor.js', () => ({
  DslEditor: (props: { initialValue: string }) => (
    <div data-testid="dsl-editor" data-initial={props.initialValue} />
  ),
}));

let heroUploaderProps:
  | {
      recipeId: number;
      currentPath: string | null;
      onUploaded: (path: string) => void;
      onRemoved: () => void;
    }
  | undefined;

vi.mock('../../../components/HeroImageUploader.js', () => ({
  HeroImageUploader: (props: {
    recipeId: number;
    currentPath: string | null;
    onUploaded: (path: string) => void;
    onRemoved: () => void;
  }) => {
    heroUploaderProps = props;
    return (
      <div
        data-testid="hero-uploader-stub"
        data-recipe-id={String(props.recipeId)}
        data-current-path={props.currentPath ?? ''}
      />
    );
  },
}));

vi.mock('react-router', async (orig) => {
  const actual = await orig<typeof import('react-router')>();
  return {
    ...actual,
    useParams: () => ({ slug: 'pancakes' }),
  };
});

import { RecipeEditPage } from '../RecipeEditPage.js';

function makeRendering(recipe: { id: number; heroImagePath: string | null }, bodyDsl: string) {
  return { recipe, version: { bodyDsl } };
}

let queryClient: QueryClient;

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
    <QueryClientProvider client={queryClient}>
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>{children}</MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

beforeEach(() => {
  recipesCreateNewDraftMock.mockReset();
  recipesGetForRenderingMock.mockReset();
  recipesListProposedSlugsMock.mockReset();
  recipesSaveDraftMock.mockReset();
  recipesPromoteMock.mockReset();
  recipesArchiveVersionMock.mockReset();
  heroUploaderProps = undefined;
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  recipesCreateNewDraftMock.mockResolvedValue({ data: { versionId: 100, versionNo: 3 } });
  recipesGetForRenderingMock.mockResolvedValue({
    data: makeRendering({ id: 42, heroImagePath: '42/hero.jpg' }, '@recipe(slug="pancakes")\n'),
  });
  recipesListProposedSlugsMock.mockResolvedValue({ data: { items: [] } });
});

describe('PRD-124 follow-up — RecipeEditPage hero uploader mount', () => {
  it('mounts HeroImageUploader with recipe.id + heroImagePath once the draft opens', async () => {
    render(
      <Wrapper>
        <RecipeEditPage />
      </Wrapper>
    );
    const stub = await screen.findByTestId('hero-uploader-stub');
    expect(stub).toHaveAttribute('data-recipe-id', '42');
    expect(stub).toHaveAttribute('data-current-path', '42/hero.jpg');
  });

  it('invalidates the rendering and list queries when upload and remove fire', async () => {
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');
    render(
      <Wrapper>
        <RecipeEditPage />
      </Wrapper>
    );
    await screen.findByTestId('hero-uploader-stub');
    expect(heroUploaderProps).toBeDefined();
    invalidateSpy.mockClear();
    heroUploaderProps?.onUploaded('42/hero.png');
    heroUploaderProps?.onRemoved();
    const renderingCalls = invalidateSpy.mock.calls.filter(
      ([arg]) =>
        Array.isArray((arg as { queryKey?: unknown[] }).queryKey) &&
        (arg as { queryKey: unknown[] }).queryKey[2] === 'getForRendering'
    );
    const listCalls = invalidateSpy.mock.calls.filter(
      ([arg]) =>
        Array.isArray((arg as { queryKey?: unknown[] }).queryKey) &&
        (arg as { queryKey: unknown[] }).queryKey[2] === 'list'
    );
    expect(renderingCalls).toHaveLength(2);
    expect(listCalls).toHaveLength(2);
  });

  it('passes a null currentPath when the recipe has no hero yet', async () => {
    recipesCreateNewDraftMock.mockResolvedValue({ data: { versionId: 1, versionNo: 1 } });
    recipesGetForRenderingMock.mockResolvedValue({
      data: makeRendering({ id: 7, heroImagePath: null }, '@recipe(slug="x")\n'),
    });
    render(
      <Wrapper>
        <RecipeEditPage />
      </Wrapper>
    );
    const stub = await screen.findByTestId('hero-uploader-stub');
    await waitFor(() => expect(stub).toHaveAttribute('data-recipe-id', '7'));
    expect(stub).toHaveAttribute('data-current-path', '');
  });
});
