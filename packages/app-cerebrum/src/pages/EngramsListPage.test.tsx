import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withQueryClient } from '../test-utils';

const sdk = vi.hoisted(() => ({
  engramsList: vi.fn(),
  retrievalSearch: vi.fn(),
  scopesList: vi.fn(),
}));

vi.mock('../cerebrum-api', () => sdk);

import { EngramsListPage } from './EngramsListPage';

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
    withQueryClient(
      <MemoryRouter>
        <EngramsListPage />
      </MemoryRouter>
    )
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.scopesList.mockResolvedValue({ data: { scopes: [{ scope: 'work', count: 1 }] } });
  sdk.retrievalSearch.mockResolvedValue({
    data: { results: [], meta: { total: 0, mode: 'hybrid' } },
  });
});

describe('EngramsListPage', () => {
  it('renders page header', async () => {
    sdk.engramsList.mockResolvedValue({ data: { engrams: [], total: 0 } });
    renderPage();
    expect(await screen.findByText('Engrams')).toBeInTheDocument();
  });

  it('shows the loading skeleton while data is in flight', () => {
    sdk.engramsList.mockReturnValue(new Promise(() => undefined));
    renderPage();
    expect(screen.getByTestId('engrams-loading')).toBeInTheDocument();
  });

  it('shows the empty state when no engrams match', async () => {
    sdk.engramsList.mockResolvedValue({ data: { engrams: [], total: 0 } });
    renderPage();
    expect(await screen.findByText('No engrams found')).toBeInTheDocument();
  });

  it('shows an error state with retry when the list query fails', async () => {
    sdk.engramsList.mockResolvedValue({ error: { message: 'boom' }, response: { status: 500 } });
    renderPage();
    expect(await screen.findByTestId('engrams-error')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(sdk.engramsList).toHaveBeenCalledTimes(2));
  });

  it('renders rows for the returned engrams', async () => {
    sdk.engramsList.mockResolvedValue({
      data: {
        engrams: [buildEngram(), buildEngram({ id: 'eng_20260417_0942_two', title: 'Second' })],
        total: 2,
      },
    });
    renderPage();
    expect(await screen.findAllByTestId('engram-row')).toHaveLength(2);
    expect(screen.getByText('First engram')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('switches to the retrieval search query when the user types', async () => {
    sdk.engramsList.mockResolvedValue({ data: { engrams: [], total: 0 } });
    sdk.retrievalSearch.mockResolvedValue({
      data: {
        results: [{ sourceId: 'eng_20260417_0942_one' }],
        meta: { total: 1, mode: 'hybrid' },
      },
    });
    renderPage();

    const searchBox = screen.getByLabelText('Search');
    await userEvent.type(searchBox, 'agents');

    await waitFor(() => {
      const lastCall = sdk.retrievalSearch.mock.calls.at(-1);
      expect(lastCall?.[0]?.body).toMatchObject({ query: 'agents', mode: 'hybrid' });
    });
  });
});
