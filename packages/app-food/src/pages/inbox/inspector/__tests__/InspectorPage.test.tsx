/**
 * PRD-135 — RTL coverage for the per-draft inspector page.
 *
 * Mocks `@pops/pillar-sdk` so the page renders against a synthetic
 * `food.inbox.getForReview` payload and asserts:
 *   - 404 renders for `{ ok: false, reason: 'SourceNotFound' }`
 *   - pending source (draft = null) shows the no-draft body
 *   - clean compiled draft surfaces the band card + Approve enabled +
 *     Approve dialog opens + confirm fires the mutation
 *   - Approve is disabled when the band is blocked / compile failed
 *   - Reject flow: `other` reason requires a note before submit enables
 *   - Archived draft renders the rejection details + Undo button + read-only editor
 *   - Re-run pipeline button shows for partial sources and is disabled for auth-dead
 *   - Clicking a proposed-slug entry sets `pendingCursor` on the DslEditor
 */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createInstance } from 'i18next';
import { useMemo, type ReactElement } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { Toaster } from 'sonner';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import enAUFood from '../../../../../../../apps/pops-shell/src/i18n/locales/en-AU/food.json';

import type { InspectorResult } from '@pops/app-food-db';

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

const approveMutation = vi.fn();
const rejectMutation = vi.fn();
const unrejectMutation = vi.fn();
const saveDraftMutation = vi.fn();
const retryMutation = vi.fn();

let mockData: InspectorResult | undefined;
let mockIsLoading = false;
let mockIsError = false;

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarQuery: (_pillarId: string, path: readonly string[]) => {
    const key = path.join('.');
    if (key === 'inbox.getForReview') {
      return {
        data: mockData,
        isLoading: mockIsLoading,
        isError: mockIsError,
        error: null,
      };
    }
    if (key === 'recipes.getForRendering') {
      return { data: undefined, isLoading: true, isError: false, error: null };
    }
    throw new Error(`Unexpected pillar query: ${key}`);
  },
  usePillarMutation: (
    _pillarId: string,
    path: readonly string[],
    opts: { onSuccess?: (res: unknown) => void }
  ) => {
    const key = path.join('.');
    if (key === 'inbox.approve') {
      return {
        mutate: (input: unknown) => {
          approveMutation(input);
          opts.onSuccess?.({ ok: true, recipeSlug: 'web-recipe', promotedVersionNo: 1 });
        },
        isPending: false,
      };
    }
    if (key === 'inbox.reject') {
      return {
        mutate: (input: unknown) => {
          rejectMutation(input);
          opts.onSuccess?.({ ok: true });
        },
        isPending: false,
      };
    }
    if (key === 'inbox.unreject') {
      return {
        mutate: (input: unknown) => {
          unrejectMutation(input);
          opts.onSuccess?.({ ok: true, restoredAs: 'draft' });
        },
        isPending: false,
      };
    }
    if (key === 'recipes.saveDraft') {
      return {
        mutate: (input: unknown) => {
          saveDraftMutation(input);
          opts.onSuccess?.({
            compile: { ok: true, lineCount: 1, stepCount: 1, creationCount: 0 },
          });
        },
        isPending: false,
      };
    }
    if (key === 'ingest.retry') {
      return { mutate: retryMutation, isPending: false };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
  usePillarUtils: () => ({ invalidate: vi.fn() }),
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
  return (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={['/food/inbox/42']}>
        <Routes>
          <Route path="/food/inbox/:sourceId" element={<InspectorPage />} />
        </Routes>
        <LocationProbe />
        <Toaster />
      </MemoryRouter>
    </I18nextProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  dslEditorProps.length = 0;
  mockData = undefined;
  mockIsLoading = false;
  mockIsError = false;
});

describe('InspectorPage — PRD-135', () => {
  it('renders the not-found view for SourceNotFound', () => {
    mockData = { ok: false, reason: 'SourceNotFound' };
    render(<Wrapper />);
    expect(screen.getByTestId('inspector-not-found')).toBeInTheDocument();
  });

  it('renders the loading state while the query is in-flight', () => {
    mockIsLoading = true;
    render(<Wrapper />);
    expect(screen.getByText(/Loading inspector/i)).toBeInTheDocument();
  });

  it('renders the no-draft body when the source has no draft yet', () => {
    mockData = buildReview({
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
    expect(screen.getByTestId('inspector-no-draft')).toBeInTheDocument();
  });

  it('approves a clean compiled draft via the confirmation dialog', async () => {
    mockData = buildReview();
    render(<Wrapper />);
    const user = userEvent.setup();
    const approveButton = screen.getByTestId('inspector-approve-button');
    expect(approveButton).not.toBeDisabled();
    await user.click(approveButton);
    expect(await screen.findByTestId('inspector-approve-dialog')).toBeInTheDocument();
    await user.click(screen.getByTestId('inspector-approve-confirm'));
    expect(approveMutation).toHaveBeenCalledWith({ versionId: 7 });
    await waitFor(() => {
      expect(screen.getByTestId('location-probe').textContent).toMatch(
        /\/food\/recipes\/web-recipe/
      );
    });
  });

  it('disables Approve when the quality band is blocked', () => {
    mockData = buildReview({
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
    expect(screen.getByTestId('inspector-approve-button')).toBeDisabled();
  });

  it('disables Approve when the compile status is not compiled', () => {
    mockData = buildReview({
      ok: true,
      review: {
        ...buildReview().review!,
        draft: { ...buildReview().review!.draft!, compileStatus: 'failed' },
      },
    } as InspectorResult);
    render(<Wrapper />);
    expect(screen.getByTestId('inspector-approve-button')).toBeDisabled();
  });

  it('requires a note when the reject reason is `other` before enabling submit', async () => {
    mockData = buildReview();
    render(<Wrapper />);
    const user = userEvent.setup();
    await user.click(screen.getByTestId('inspector-reject-button'));
    const reasonSelect = await screen.findByTestId('inspector-reject-reason');
    await user.selectOptions(reasonSelect, 'other');
    const confirm = screen.getByTestId('inspector-reject-confirm');
    expect(confirm).toBeDisabled();
    await user.type(screen.getByTestId('inspector-reject-note'), 'because reasons');
    expect(confirm).not.toBeDisabled();
    await user.click(confirm);
    expect(rejectMutation).toHaveBeenCalledWith({
      versionId: 7,
      reason: 'other',
      note: 'because reasons',
    });
  });

  it('renders the archived-version Undo flow + read-only editor', async () => {
    mockData = buildReview({
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
    expect(screen.getByTestId('inspector-rejection-details')).toBeInTheDocument();
    expect(screen.getByTestId('dsl-editor-mock')).toHaveAttribute('data-readonly', 'true');
    expect(screen.queryByTestId('inspector-approve-button')).not.toBeInTheDocument();
    const user = userEvent.setup();
    await user.click(screen.getByTestId('inspector-undo-button'));
    expect(unrejectMutation).toHaveBeenCalledWith({ versionId: 7 });
  });

  it('shows Re-run pipeline for partial sources, disabled for auth-dead', () => {
    mockData = buildReview({
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
    const rerun = screen.getByTestId('inspector-rerun-button');
    expect(rerun).toBeDisabled();
  });

  it('clicking a proposed-slug entry forwards line/col via pendingCursor', async () => {
    mockData = buildReview({
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
    await user.click(screen.getByTestId('inspector-proposed-slug-mystery-ingredient'));
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
