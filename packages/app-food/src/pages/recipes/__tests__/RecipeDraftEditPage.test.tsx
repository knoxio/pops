import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const mockListDrafts = vi.fn();

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'recipes.listDrafts') return mockListDrafts(input);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
}));

vi.mock('../RecipeEditPage.js', () => ({
  RecipeEditShell: ({
    slug,
    versionId,
    versionNo,
  }: {
    slug: string;
    versionId: number | null;
    versionNo: number | null;
  }) => (
    <div
      data-testid="edit-shell-stub"
      data-slug={slug}
      data-vid={versionId ?? 'null'}
      data-vno={versionNo ?? 'null'}
    />
  ),
}));

let currentParams: { slug: string | undefined; draftNo: string | undefined } = {
  slug: 'pancakes',
  draftNo: '2',
};
vi.mock('react-router', async (orig) => {
  const actual = await orig<typeof import('react-router')>();
  return {
    ...actual,
    useParams: () => currentParams,
  };
});

import { RecipeDraftEditPage } from '../RecipeDraftEditPage.js';

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
  mockListDrafts.mockReset();
  currentParams = { slug: 'pancakes', draftNo: '2' };
});

describe('PRD-119-D — RecipeDraftEditPage', () => {
  it('alerts when the URL is missing slug or draftNo', () => {
    currentParams = { slug: undefined, draftNo: undefined };
    render(
      <Wrapper>
        <RecipeDraftEditPage />
      </Wrapper>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/missing/i);
  });

  it('alerts when the draftNo is not a positive integer', () => {
    currentParams = { slug: 'pancakes', draftNo: 'banana' };
    render(
      <Wrapper>
        <RecipeDraftEditPage />
      </Wrapper>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/invalid/i);
  });

  it('shows loading status while drafts are being fetched', () => {
    mockListDrafts.mockReturnValue({ isLoading: true, data: undefined, error: null });
    render(
      <Wrapper>
        <RecipeDraftEditPage />
      </Wrapper>
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading draft/i);
  });

  it('alerts when no matching draftNo is found', () => {
    mockListDrafts.mockReturnValue({
      isLoading: false,
      data: { drafts: [{ versionId: 1, versionNo: 1 }] },
      error: null,
    });
    render(
      <Wrapper>
        <RecipeDraftEditPage />
      </Wrapper>
    );
    expect(screen.getByRole('alert')).toHaveTextContent(/draft #2 does not exist/i);
  });

  it('renders the edit-shell stub with the matched (versionId, versionNo)', () => {
    mockListDrafts.mockReturnValue({
      isLoading: false,
      data: {
        drafts: [
          { versionId: 1, versionNo: 1 },
          { versionId: 22, versionNo: 2 },
        ],
      },
      error: null,
    });
    render(
      <Wrapper>
        <RecipeDraftEditPage />
      </Wrapper>
    );
    const stub = screen.getByTestId('edit-shell-stub');
    expect(stub).toHaveAttribute('data-slug', 'pancakes');
    expect(stub).toHaveAttribute('data-vid', '22');
    expect(stub).toHaveAttribute('data-vno', '2');
  });
});
