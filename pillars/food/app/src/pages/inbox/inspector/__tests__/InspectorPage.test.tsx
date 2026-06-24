/**
 * RTL coverage for the per-draft inspector page.
 * Spec: pillars/food/docs/prds/draft-inspector
 *
 * Mocks the food API client so the page renders against a synthetic
 * `inboxGetForReview` payload.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '@pops/locales/en-AU/food.json';

import type { InspectorResult } from '../inspector-wire-types.js';

// Capture the latest props passed into DslEditor so the cursor-move test can
// assert. Returning a dummy element keeps the rest of the page rendering.
const dslEditorProps: Array<Record<string, unknown>> = [];
vi.mock('../../../../components/DslEditor.js', () => ({
  DslEditor: (props: Record<string, unknown>) => {
    dslEditorProps.push(props);
    return <div data-testid="dsl-editor-mock" data-readonly={String(props.readOnly === true)} />;
  },
}));

vi.mock('../../../../components/RecipeRenderer.js', () => ({
  RecipeRenderer: () => <div data-testid="recipe-renderer-mock" />,
}));

const inboxGetForReviewMock = vi.hoisted(() => vi.fn());
const inboxApproveMock = vi.hoisted(() => vi.fn());
const inboxRejectMock = vi.hoisted(() => vi.fn());
const inboxUnrejectMock = vi.hoisted(() => vi.fn());
const recipesSaveDraftMock = vi.hoisted(() => vi.fn());
const recipesGetForRenderingMock = vi.hoisted(() => vi.fn());
const ingestRetryMock = vi.hoisted(() => vi.fn());

vi.mock('../../../../food-api/index.js', () => ({
  inboxGetForReview: inboxGetForReviewMock,
  inboxApprove: inboxApproveMock,
  inboxReject: inboxRejectMock,
  inboxUnreject: inboxUnrejectMock,
  recipesSaveDraft: recipesSaveDraftMock,
  recipesGetForRendering: recipesGetForRenderingMock,
  ingestRetry: ingestRetryMock,
}));

import { InspectorPage } from '../InspectorPage.js';

function buildReview(overrides?: Partial<InspectorResult>): InspectorResult {
  const base: InspectorResult = {
    ok: true,
    review: {
      source: {
        id: 42,
        kind: 'url-web',
        url: 'https://example.test/r',
        caption: null,
        ingestedAt: '2026-06-10 12:00:00',
        extractorVersion: 'test-1',
        state: 'completed',
        reviewedAt: null,
        archivedAt: null,
        errorCode: null,
        errorMessage: null,
        attempts: 0,
        meta: null,
        inferenceLogs: [],
        totalCostUsd: 0,
      },
      draft: {
        versionId: 7,
        versionNo: 1,
        recipeSlug: 'web-recipe',
        recipeArchivedAt: null,
        status: 'draft',
        title: 'Test web-recipe',
        bodyDsl: '@recipe(slug="web-recipe", title="Test")',
        compileStatus: 'compiled',
        compileError: null,
        compiledAt: '2026-06-10 12:00:01',
        rejection: null,
        proposedSlugs: [],
        creations: [],
        quality: { band: 'clean', score: 100, signals: [] },
      },
    },
  };
  return { ...base, ...overrides } as InspectorResult;
}

function LocationProbe(): ReactElement {
  const location = useLocation();
  return (
    <div data-testid="location-probe">
      {location.pathname}
      {location.search}
    </div>
  );
}

function Wrapper(): ReactElement {
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
        <MemoryRouter initialEntries={['/food/inbox/42']}>
          <Routes>
            <Route path="/food/inbox/:sourceId" element={<InspectorPage />} />
          </Routes>
          <LocationProbe />
          <Toaster />
        </MemoryRouter>
      </I18nextProvider>
    </QueryClientProvider>
  );
}

function mockReview(result: InspectorResult): void {
  inboxGetForReviewMock.mockResolvedValue({ data: result });
}

beforeEach(() => {
  vi.clearAllMocks();
  dslEditorProps.length = 0;
  recipesGetForRenderingMock.mockReturnValue(new Promise(() => {}));
  inboxApproveMock.mockResolvedValue({
    data: { ok: true, recipeSlug: 'web-recipe', promotedVersionNo: 1 },
  });
  inboxRejectMock.mockResolvedValue({ data: { ok: true } });
  inboxUnrejectMock.mockResolvedValue({ data: { ok: true, restoredAs: 'draft' } });
  recipesSaveDraftMock.mockResolvedValue({
    data: { compile: { ok: true, lineCount: 1, stepCount: 1, creationCount: 0 } },
  });
  ingestRetryMock.mockResolvedValue({ data: { jobId: 'j1', queuedAt: '2026-06-10T16:00:00Z' } });
});

describe('InspectorPage', () => {
  it('renders the not-found view for SourceNotFound', async () => {
    mockReview({ ok: false, reason: 'SourceNotFound' });
    render(<Wrapper />);
    expect(await screen.findByTestId('inspector-not-found')).toBeInTheDocument();
  });

  it('renders the loading state while the query is in-flight', () => {
    inboxGetForReviewMock.mockReturnValue(new Promise(() => {}));
    render(<Wrapper />);
    expect(screen.getByText(/Loading inspector/i)).toBeInTheDocument();
  });

  it('renders the no-draft body when the source has no draft yet', async () => {
    mockReview({
      ok: true,
      review: {
        ...buildReview().review!,
        draft: null,
        source: {
          ...buildReview().review!.source,
          state: 'processing',
          draftRecipeId: null as never,
        },
      },
    } as InspectorResult);
    render(<Wrapper />);
    expect(await screen.findByTestId('inspector-no-draft')).toBeInTheDocument();
  });

  it('approves a clean compiled draft via the confirmation dialog', async () => {
    mockReview(buildReview());
    render(<Wrapper />);
    const user = userEvent.setup();
    const approveButton = await screen.findByTestId('inspector-approve-button');
    expect(approveButton).not.toBeDisabled();
    await user.click(approveButton);
    expect(await screen.findByTestId('inspector-approve-dialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('inspector-approve-confirm'));
    expect(inboxApproveMock).toHaveBeenCalledWith({ body: { versionId: 7 } });
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toMatch(
        /\/food\/recipes\/web-recipe/
      );
    });
  });

  it('disables Approve when the quality band is blocked', async () => {
    mockReview({
      ok: true,
      review: {
        ...buildReview().review!,
        draft: {
          ...buildReview().review!.draft!,
          quality: { band: 'blocked', score: 5, signals: [] },
        },
      },
    } as InspectorResult);
    render(<Wrapper />);
    expect(await screen.findByTestId('inspector-approve-button')).toBeDisabled();
  });

  it('disables Approve when the compile status is not compiled', async () => {
    mockReview({
      ok: true,
      review: {
        ...buildReview().review!,
        draft: { ...buildReview().review!.draft!, compileStatus: 'failed' },
      },
    } as InspectorResult);
    render(<Wrapper />);
    expect(await screen.findByTestId('inspector-approve-button')).toBeDisabled();
  });

  it('requires a note when the reject reason is `other` before enabling submit', async () => {
    mockReview(buildReview());
    render(<Wrapper />);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('inspector-reject-button'));
    const reasonSelect = await screen.findByTestId('inspector-reject-reason');
    await user.selectOptions(reasonSelect, 'other');
    const confirm = screen.getByTestId('inspector-reject-confirm');
    expect(confirm).toBeDisabled();
    await user.type(screen.getByTestId('inspector-reject-note'), 'because reasons');
    expect(confirm).not.toBeDisabled();
    await user.click(confirm);
    expect(inboxRejectMock).toHaveBeenCalledWith({
      body: { versionId: 7, reason: 'other', note: 'because reasons' },
    });
  });

  it('renders the archived-version Undo flow + read-only editor', async () => {
    mockReview({
      ok: true,
      review: {
        ...buildReview().review!,
        draft: {
          ...buildReview().review!.draft!,
          status: 'archived',
          rejection: {
            reason: 'duplicate',
            note: 'already have this one',
            rejectedAt: '2026-06-10 13:00:00',
          },
        },
      },
    } as InspectorResult);
    render(<Wrapper />);
    expect(await screen.findByTestId('inspector-rejection-details')).toBeInTheDocument();
    expect(screen.getByTestId('dsl-editor-mock')).toHaveAttribute('data-readonly', 'true');
    expect(screen.queryByTestId('inspector-approve-button')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('inspector-undo-button'));
    expect(inboxUnrejectMock).toHaveBeenCalledWith({ body: { versionId: 7 } });
  });

  it('shows Re-run pipeline for partial sources, disabled for auth-dead', async () => {
    mockReview({
      ok: true,
      review: {
        ...buildReview().review!,
        source: {
          ...buildReview().review!.source,
          state: 'partial',
          partialReason: 'auth-dead',
        },
      },
    } as InspectorResult);
    render(<Wrapper />);
    const rerun = await screen.findByTestId('inspector-rerun-button');
    expect(rerun).toBeDisabled();
  });

  it('clicking a proposed-slug entry forwards line/col via pendingCursor', async () => {
    mockReview({
      ok: true,
      review: {
        ...buildReview().review!,
        draft: {
          ...buildReview().review!.draft!,
          proposedSlugs: [
            {
              slug: 'mystery-ingredient',
              suggestedKind: 'ingredient',
              fromLoc: { startLine: 4, startCol: 12, endLine: 4, endCol: 30 },
              createdAt: '2026-06-10 12:00:02',
            },
          ],
        },
      },
    } as InspectorResult);
    render(<Wrapper />);
    const user = userEvent.setup();
    await user.click(await screen.findByTestId('inspector-proposed-slug-mystery-ingredient'));
    const lastProps = dslEditorProps[dslEditorProps.length - 1];
    expect(lastProps).toBeDefined();
    if (lastProps === undefined) return;
    const pendingCursor = lastProps['pendingCursor'] as {
      line: number;
      col: number;
      nonce: number;
    };
    expect(pendingCursor).toMatchObject({ line: 4, col: 12 });
    expect(pendingCursor.nonce).toBeTypeOf('number');
  });
});
