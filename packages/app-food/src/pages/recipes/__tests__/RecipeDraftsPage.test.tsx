import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

const mockListDrafts = vi.fn();
const mockListDraftsInvalidate = vi.fn();
const mockPromoteMutate = vi.fn();
let mockPromoteOnSuccess:
  | ((res: { ok: boolean; reason?: string; versionId?: number }) => void)
  | undefined;
const mockDiscardMutate = vi.fn();
let mockDiscardOnSuccess: (() => void) | undefined;

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[], input: unknown) => {
    const key = path.join('.');
    if (key === 'recipes.listDrafts') return mockListDrafts(input);
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: {
      onSuccess?: (res: { ok: boolean; reason?: string; versionId?: number }) => void;
      onError?: (err: Error) => void;
    }
  ) => {
    const key = path.join('.');
    if (key === 'recipes.promote') {
      mockPromoteOnSuccess = opts.onSuccess;
      return { mutate: mockPromoteMutate, isPending: false };
    }
    if (key === 'recipes.archiveVersion') {
      mockDiscardOnSuccess = opts.onSuccess as (() => void) | undefined;
      return { mutate: mockDiscardMutate, isPending: false };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({
    invalidate: (path: readonly string[]) => {
      const key = path.join('.');
      if (key === 'recipes.listDrafts') return mockListDraftsInvalidate();
      return undefined;
    },
    setData: vi.fn(),
  }),
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
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>{children}</MemoryRouter>
    </I18nextProvider>
  );
}

beforeEach(() => {
  mockListDrafts.mockReset();
  mockListDraftsInvalidate.mockReset();
  mockPromoteMutate.mockReset();
  mockDiscardMutate.mockReset();
  navigateMock.mockReset();
});

describe('PRD-119-D — RecipeDraftsPage', () => {
  it('shows the loading state while drafts are fetching', () => {
    mockListDrafts.mockReturnValue({ isLoading: true, data: undefined, error: null });
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    expect(screen.getByRole('status')).toHaveTextContent(/loading drafts/i);
  });

  it('shows the empty state when no drafts exist', () => {
    mockListDrafts.mockReturnValue({ isLoading: false, data: { drafts: [] }, error: null });
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    expect(screen.getByText(/no drafts yet/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /start a draft/i })).toHaveAttribute(
      'href',
      '/food/recipes/pancakes/edit'
    );
  });

  it('renders one row per draft with Edit / Promote / Discard buttons', () => {
    mockListDrafts.mockReturnValue({
      isLoading: false,
      data: {
        drafts: [
          makeDraft(),
          makeDraft({ versionId: 12, versionNo: 3, compileStatus: 'uncompiled' }),
        ],
      },
      error: null,
    });
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    const rows = screen.getAllByRole('article');
    expect(rows).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: /edit/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /^promote/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /discard/i })).toHaveLength(2);
  });

  it('disables Promote for uncompiled drafts', () => {
    mockListDrafts.mockReturnValue({
      isLoading: false,
      data: { drafts: [makeDraft({ compileStatus: 'uncompiled' })] },
      error: null,
    });
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    expect(screen.getByRole('button', { name: /promote/i })).toBeDisabled();
  });

  it('fires promote mutation and navigates to detail on success', async () => {
    const user = userEvent.setup();
    mockListDrafts.mockReturnValue({
      isLoading: false,
      data: { drafts: [makeDraft({ versionId: 99 })] },
      error: null,
    });
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    await user.click(screen.getByRole('button', { name: /promote/i }));
    expect(mockPromoteMutate).toHaveBeenCalledWith({ versionId: 99 });
    mockPromoteOnSuccess?.({ ok: true, versionId: 99 });
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('/food/recipes/pancakes'));
  });

  it('confirms before discarding and fires archiveVersion', async () => {
    const user = userEvent.setup();
    mockListDrafts.mockReturnValue({
      isLoading: false,
      data: { drafts: [makeDraft({ versionId: 77 })] },
      error: null,
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    await user.click(screen.getByRole('button', { name: /discard/i }));
    expect(confirmSpy).toHaveBeenCalled();
    expect(mockDiscardMutate).toHaveBeenCalledWith({ versionId: 77 });
    mockDiscardOnSuccess?.();
    await waitFor(() => expect(mockListDraftsInvalidate).toHaveBeenCalled());
    confirmSpy.mockRestore();
  });

  it('skips the discard mutation when the user cancels the confirm', async () => {
    const user = userEvent.setup();
    mockListDrafts.mockReturnValue({
      isLoading: false,
      data: { drafts: [makeDraft()] },
      error: null,
    });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(
      <Wrapper>
        <RecipeDraftsPage />
      </Wrapper>
    );
    await user.click(screen.getByRole('button', { name: /discard/i }));
    expect(mockDiscardMutate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });
});
