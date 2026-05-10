import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// ── tRPC mock ────────────────────────────────────────────────────────

const mockEngramsListQuery = vi.fn();
const mockSearchQuery = vi.fn();
const mockScopesListQuery = vi.fn();

vi.mock('@pops/api-client', () => ({
  trpc: {
    cerebrum: {
      engrams: {
        list: { useQuery: (...args: unknown[]) => mockEngramsListQuery(...args) },
      },
      retrieval: {
        search: { useQuery: (...args: unknown[]) => mockSearchQuery(...args) },
      },
      scopes: {
        list: { useQuery: (...args: unknown[]) => mockScopesListQuery(...args) },
      },
    },
  },
}));

// Pull in the page after the mock so it picks up the mocked client.
import { EngramsListPage } from './EngramsListPage';

// ── helpers ──────────────────────────────────────────────────────────

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

function renderPage() {
  return render(
    <MemoryRouter>
      <EngramsListPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockScopesListQuery.mockReturnValue({
    data: { scopes: [{ scope: 'work', count: 1 }] },
    isLoading: false,
  });
  mockSearchQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  });
});

describe('EngramsListPage', () => {
  it('renders page header', () => {
    mockEngramsListQuery.mockReturnValue({
      data: { engrams: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('Engrams')).toBeInTheDocument();
  });

  it('shows the loading skeleton while data is in flight', () => {
    mockEngramsListQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByTestId('engrams-loading')).toBeInTheDocument();
  });

  it('shows the empty state when no engrams match', () => {
    mockEngramsListQuery.mockReturnValue({
      data: { engrams: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText('No engrams found')).toBeInTheDocument();
  });

  it('shows an error state with retry when the list query fails', async () => {
    const refetch = vi.fn();
    mockEngramsListQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      error: { message: 'boom' },
      refetch,
    });
    renderPage();
    expect(screen.getByTestId('engrams-error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it('renders rows for the returned engrams', () => {
    mockEngramsListQuery.mockReturnValue({
      data: {
        engrams: [buildEngram(), buildEngram({ id: 'eng_20260417_0942_two', title: 'Second' })],
        total: 2,
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getAllByTestId('engram-row')).toHaveLength(2);
    expect(screen.getByText('First engram')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('switches to the retrieval search query when the user types', async () => {
    mockEngramsListQuery.mockReturnValue({
      data: { engrams: [], total: 0 },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockSearchQuery.mockReturnValue({
      data: {
        results: [{ sourceId: 'eng_20260417_0942_one' }],
        meta: { total: 1, mode: 'hybrid' },
      },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderPage();

    const searchBox = screen.getByLabelText('Search');
    await userEvent.type(searchBox, 'agents');

    // The search query should have been called with `enabled: true` once a
    // query is present. Verify by inspecting the latest call.
    const lastCall = mockSearchQuery.mock.calls.at(-1);
    expect(lastCall?.[0]).toMatchObject({ query: 'agents', mode: 'hybrid' });
    expect(lastCall?.[1]).toMatchObject({ enabled: true });
  });
});
