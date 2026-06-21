import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const recipesListDraftsMock = vi.hoisted(() => vi.fn());
const recipesPromoteMock = vi.hoisted(() => vi.fn());
const recipesArchiveVersionMock = vi.hoisted(() => vi.fn());

vi.mock('../../../food-api/index.js', () => ({
  recipesListDrafts: recipesListDraftsMock,
  recipesPromote: recipesPromoteMock,
  recipesArchiveVersion: recipesArchiveVersionMock,
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

import { RecipeDraftsPage } from '../RecipeDraftsPage.js';

function makeDraft(
  over: Partial<{
    versionId: number;
    versionNo: number;
    title: string;
    compileStatus: 'compiled' | 'uncompiled' | 'failed';
    createdAt: string;
    preview: string;
  }> = {}
) {
  return {
    versionId: 11,
    versionNo: 2,
    title: 'Banana pancakes (draft)',
    compileStatus: 'compiled' as const,
    createdAt: '2026-01-02',
    preview: '@recipe(slug="pancakes")',
    ...over,
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

function resolveDrafts(drafts: ReturnType<typeof makeDraft>[]): void {
  recipesListDraftsMock.mockResolvedValue({ data: { drafts } });
}

beforeEach(() => {
  recipesListDraftsMock.mockReset();
  recipesPromoteMock.mockReset();
  recipesArchiveVersionMock.mockReset();
  navigateMock.mockReset();
});

describe('PRD-119-D — RecipeDraftsPage', () => {
  it('shows the loading state while drafts are fetching', () => {
    recipesListDraftsMock.mockReturnValue(new Promise(() => {}));
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading drafts/i);
  });

  it('shows the empty state when no drafts exist', async () => {
    resolveDrafts([]);
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    expect(await screen.findByText(/no drafts yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start a draft/i })).toHaveAttribute(
      'href',
      '/food/recipes/pancakes/edit'
    );
  });

  it('renders one row per draft with Edit / Promote / Discard buttons', async () => {
    resolveDrafts([
      makeDraft(),
      makeDraft({ versionId: 12, versionNo: 3, compileStatus: 'uncompiled' }),
    ]);
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    await waitFor(() => expect(screen.getAllByRole('article')).toHaveLength(2));
    expect(screen.getAllByRole('link', { name: /edit/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^promote/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /discard/i })).toHaveLength(2);
  });

  it('disables Promote for uncompiled drafts', async () => {
    resolveDrafts([makeDraft({ compileStatus: 'uncompiled' })]);
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    await waitFor(() => expect(screen.getByRole('button', { name: /promote/i })).toBeDisabled());
  });

  it('fires promote mutation and navigates to detail on success', async () => {
    const user = userEvent.setup();
    resolveDrafts([makeDraft({ versionId: 99 })]);
    recipesPromoteMock.mockResolvedValue({ data: { ok: true, versionId: 99 } });
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    await user.click(await screen.findByRole('button', { name: /promote/i }));
    await waitFor(() =>
      expect(recipesPromoteMock).toHaveBeenCalledWith({ path: { versionId: 99 } })
    );
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/food/recipes/pancakes'));
  });

  it('confirms before discarding and fires archiveVersion', async () => {
    const user = userEvent.setup();
    resolveDrafts([makeDraft({ versionId: 77 })]);
    recipesArchiveVersionMock.mockResolvedValue({ data: { ok: true } });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    await user.click(await screen.findByRole('button', { name: /discard/i }));
    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() =>
      expect(recipesArchiveVersionMock).toHaveBeenCalledWith({ path: { versionId: 77 } })
    );
    confirmSpy.mockRestore();
  });

  it('skips the discard mutation when the user cancels the confirm', async () => {
    const user = userEvent.setup();
    resolveDrafts([makeDraft()]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    await user.click(await screen.findByRole('button', { name: /discard/i }));
    expect(recipesArchiveVersionMock).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
