import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const recipesListDraftsMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  recipesListDrafts: recipesListDraftsMock,
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
  const client = useMemo(
    () => new QueryClient({ defaultOptions: { queries: { retry: false } } }),
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

function resolveDrafts(drafts: { versionId: number; versionNo: number }[]): void {
  recipesListDraftsMock.mockResolvedValue({
    data: {
      drafts: drafts.map((d) => ({
        ...d,
        title: 't',
        compileStatus: 'compiled',
        createdAt: 'x',
        preview: '',
      })),
    },
  });
}

beforeEach(() => {
  recipesListDraftsMock.mockReset();
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
    recipesListDraftsMock.mockReturnValue(new Promise(() => {}));
    render(
      <Wrapper>
        <RecipeDraftEditPage />
      </Wrapper>
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading draft/i);
  });

  it('alerts when no matching draftNo is found', async () => {
    resolveDrafts([{ versionId: 1, versionNo: 1 }]);
    render(
      <Wrapper>
        <RecipeDraftEditPage />
      </Wrapper>
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/draft #2 does not exist/i);
  });

  it('renders the edit-shell stub with the matched (versionId, versionNo)', async () => {
    resolveDrafts([
      { versionId: 1, versionNo: 1 },
      { versionId: 22, versionNo: 2 },
    ]);
    render(
      <Wrapper>
        <RecipeDraftEditPage />
      </Wrapper>
    );
    const stub = await screen.findByTestId('edit-shell-stub');
    expect(stub).toHaveAttribute('data-slug', 'pancakes');
    expect(stub).toHaveAttribute('data-vid', '22');
    expect(stub).toHaveAttribute('data-vno', '2');
  });
});
