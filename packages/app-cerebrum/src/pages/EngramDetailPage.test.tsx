import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── tRPC mock ────────────────────────────────────────────────────────

const mockGetQuery = vi.fn();
const mockListQuery = vi.fn();
const mockUpdateMutate = vi.fn();
const mockUpdateMutationState = { isPending: false, error: null as unknown };
const invalidateGet = vi.fn().mockResolvedValue(undefined);
const invalidateList = vi.fn().mockResolvedValue(undefined);

vi.mock('@pops/api-client', () => ({
  trpc: {
    useUtils: () => ({
      cerebrum: {
        engrams: {
          get: { invalidate: invalidateGet },
          list: { invalidate: invalidateList },
        },
      },
    }),
    cerebrum: {
      engrams: {
        get: { useQuery: (...args: unknown[]) => mockGetQuery(...args) },
        list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
        update: {
          useMutation: (opts: { onSuccess?: () => void | Promise<void> }) => ({
            mutate: (...args: unknown[]) => {
              mockUpdateMutate(...args);
              void opts.onSuccess?.();
            },
            isPending: mockUpdateMutationState.isPending,
            error: mockUpdateMutationState.error,
          }),
        },
      },
    },
  },
}));

import { EngramDetailPage } from './EngramDetailPage';

interface Engram {
  id: string;
  type: string;
  scopes: string[];
  tags: string[];
  links: string[];
  created: string;
  modified: string;
  source: string;
  status: string;
  template: string | null;
  title: string;
  filePath: string;
  contentHash: string;
  wordCount: number;
  customFields: Record<string, unknown>;
}

function buildEngram(overrides: Partial<Engram> = {}): Engram {
  return {
    id: 'eng_20260417_0942_one',
    type: 'note',
    scopes: ['work'],
    tags: ['ai'],
    links: [],
    created: '2026-04-17T09:42:00Z',
    modified: '2026-04-17T09:42:00Z',
    source: 'manual',
    status: 'active',
    template: null,
    title: 'First engram',
    filePath: 'notes/one.md',
    contentHash: 'h1',
    wordCount: 42,
    customFields: {},
    ...overrides,
  };
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/cerebrum/engrams/:id" element={<EngramDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockUpdateMutationState.isPending = false;
  mockUpdateMutationState.error = null;
  window.localStorage.clear();
});

describe('EngramDetailPage', () => {
  it('shows the loading state while fetching', () => {
    mockGetQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
    mockListQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');
    expect(screen.getByTestId('engram-detail-loading')).toBeInTheDocument();
  });

  it('renders the body and metadata in read-only mode', () => {
    mockGetQuery.mockReturnValue({
      data: { engram: buildEngram(), body: 'hello world' },
      isLoading: false,
      error: null,
    });
    mockListQuery.mockReturnValue({ data: { engrams: [], total: 0 }, isLoading: false });
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');

    expect(screen.getByRole('heading', { level: 2, name: 'First engram' })).toBeInTheDocument();
    expect(screen.getByText('hello world')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('renders connected engrams when links are present', () => {
    const engram = buildEngram({ links: ['eng_20260417_0942_two'] });
    mockGetQuery.mockReturnValue({
      data: { engram, body: 'parent body' },
      isLoading: false,
      error: null,
    });
    mockListQuery.mockReturnValue({
      data: {
        engrams: [buildEngram({ id: 'eng_20260417_0942_two', title: 'Linked engram' })],
        total: 1,
      },
      isLoading: false,
      error: null,
    });
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');
    expect(screen.getByText('Linked engram')).toBeInTheDocument();
  });

  it('switches into edit mode when Edit is clicked', async () => {
    mockGetQuery.mockReturnValue({
      data: { engram: buildEngram(), body: 'hello' },
      isLoading: false,
      error: null,
    });
    mockListQuery.mockReturnValue({ data: { engrams: [], total: 0 }, isLoading: false });
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');

    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('flags missing title and empty scopes as validation errors', async () => {
    mockGetQuery.mockReturnValue({
      data: { engram: buildEngram({ scopes: ['work'] }), body: 'hello' },
      isLoading: false,
      error: null,
    });
    mockListQuery.mockReturnValue({ data: { engrams: [], total: 0 }, isLoading: false });
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');

    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    const titleInput = screen.getByLabelText('Title');
    await userEvent.clear(titleInput);
    expect(screen.getByTestId('engram-edit-errors')).toHaveTextContent('Title is required');

    // Save should be disabled while invalid.
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('calls update with normalised payload on save', async () => {
    mockGetQuery.mockReturnValue({
      data: { engram: buildEngram(), body: 'hello' },
      isLoading: false,
      error: null,
    });
    mockListQuery.mockReturnValue({ data: { engrams: [], total: 0 }, isLoading: false });
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');

    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    const titleInput = screen.getByLabelText('Title');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Updated title');

    const body = screen.getByLabelText('Body');
    await userEvent.clear(body);
    await userEvent.type(body, 'New body');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    expect(mockUpdateMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'eng_20260417_0942_one',
        title: 'Updated title',
        body: 'New body',
        scopes: ['work'],
        status: 'active',
      })
    );
    expect(invalidateGet).toHaveBeenCalled();
    expect(invalidateList).toHaveBeenCalled();
  });

  it('shows the not-found message when get returns NOT_FOUND', () => {
    mockGetQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'missing', data: { code: 'NOT_FOUND' } },
    });
    mockListQuery.mockReturnValue({ data: undefined, isLoading: false });
    renderAt('/cerebrum/engrams/eng_missing');
    expect(screen.getByText('Engram not found.')).toBeInTheDocument();
  });
});
