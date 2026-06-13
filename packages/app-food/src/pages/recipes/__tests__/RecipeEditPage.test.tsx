/**
 * PRD-124 follow-up — verifies the `RecipeEditPage` recipe edit shell
 * mounts the `HeroImageUploader` with the recipe's id + heroImagePath,
 * and that the upload/remove callbacks invalidate the rendering query
 * so the new path round-trips into the editor surface.
 */
import { act, render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const createDraftMutate = vi.fn();
let createDraftOnSuccess: ((res: { versionId: number; versionNo: number }) => void) | undefined;

const getForRenderingInvalidate = vi.fn();
const listInvalidate = vi.fn();

interface RenderingResponse {
  recipe: { id: number; heroImagePath: string | null };
  version: { bodyDsl: string };
}

let renderingData: RenderingResponse | undefined;

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (key === 'recipes.getForRendering') return { data: renderingData };
    if (key === 'recipes.listProposedSlugs') return { data: { items: [] } };
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: { onSuccess?: (res: { versionId: number; versionNo: number }) => void }
  ) => {
    const key = path.join('.');
    if (key === 'recipes.createNewDraft') {
      createDraftOnSuccess = opts.onSuccess;
      return { mutate: createDraftMutate, isPending: false };
    }
    if (
      key === 'recipes.saveDraft' ||
      key === 'recipes.promote' ||
      key === 'recipes.archiveVersion'
    ) {
      return { mutate: vi.fn(), isPending: false };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    invalidate: (path: readonly string[], input?: unknown) => {
      const key = path.join('.');
      if (key === 'recipes.getForRendering') return getForRenderingInvalidate(input);
      if (key === 'recipes.list') return listInvalidate(input);
      return undefined;
    },
    setData: vi.fn(),
  }),
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
  createDraftMutate.mockReset();
  getForRenderingInvalidate.mockReset();
  listInvalidate.mockReset();
  createDraftOnSuccess = undefined;
  heroUploaderProps = undefined;
  renderingData = {
    recipe: { id: 42, heroImagePath: '42/hero.jpg' },
    version: { bodyDsl: '@recipe(slug="pancakes")\n' },
  };
});

describe('PRD-124 follow-up — RecipeEditPage hero uploader mount', () => {
  it('mounts HeroImageUploader with recipe.id + heroImagePath once the draft opens', () => {
    render(
      <Wrapper>
        <RecipeEditPage />
      </Wrapper>
    );
    act(() => {
      createDraftOnSuccess?.({ versionId: 100, versionNo: 3 });
    });
    const stub = screen.getByTestId('hero-uploader-stub');
    expect(stub).toHaveAttribute('data-recipe-id', '42');
    expect(stub).toHaveAttribute('data-current-path', '42/hero.jpg');
  });

  it('invalidates the rendering and list queries when upload and remove fire', () => {
    render(
      <Wrapper>
        <RecipeEditPage />
      </Wrapper>
    );
    act(() => {
      createDraftOnSuccess?.({ versionId: 100, versionNo: 3 });
    });
    expect(heroUploaderProps).toBeDefined();
    heroUploaderProps?.onUploaded('42/hero.png');
    heroUploaderProps?.onRemoved();
    expect(getForRenderingInvalidate).toHaveBeenCalledTimes(2);
    expect(listInvalidate).toHaveBeenCalledTimes(2);
  });

  it('passes a null currentPath when the recipe has no hero yet', () => {
    renderingData = {
      recipe: { id: 7, heroImagePath: null },
      version: { bodyDsl: '@recipe(slug="x")\n' },
    };
    render(
      <Wrapper>
        <RecipeEditPage />
      </Wrapper>
    );
    act(() => {
      createDraftOnSuccess?.({ versionId: 1, versionNo: 1 });
    });
    const stub = screen.getByTestId('hero-uploader-stub');
    expect(stub).toHaveAttribute('data-recipe-id', '7');
    expect(stub).toHaveAttribute('data-current-path', '');
  });
});
