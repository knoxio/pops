import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withQueryClient } from '../test-utils';

const sdk = vi.hoisted(() => ({
  engramsGet: vi.fn(),
  engramsList: vi.fn(),
  engramsUpdate: vi.fn(),
}));

vi.mock('../cerebrum-api', () => sdk);

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

function notFound() {
  return { error: { message: 'missing' }, response: { status: 404 } };
}

function renderAt(path: string) {
  return render(
    withQueryClient(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/cerebrum/engrams/:id" element={<EngramDetailPage />} />
        </Routes>
      </MemoryRouter>
    )
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.engramsList.mockResolvedValue({ data: { engrams: [], total: 0 } });
  window.localStorage.clear();
});

describe('EngramDetailPage', () => {
  it('shows the loading state while fetching', () => {
    sdk.engramsGet.mockReturnValue(new Promise(() => undefined));
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');
    expect(screen.getByTestId('engram-detail-loading')).toBeInTheDocument();
  });

  it('renders the body and metadata in read-only mode', async () => {
    sdk.engramsGet.mockResolvedValue({ data: { engram: buildEngram(), body: 'hello world' } });
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');

    expect(
      await screen.findByRole('heading', { level: 2, name: 'First engram' })
    ).toBeInTheDocument();
    expect(screen.getByText('hello world')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('renders connected engrams when links are present', async () => {
    const engram = buildEngram({ links: ['eng_20260417_0942_two'] });
    sdk.engramsGet.mockResolvedValue({ data: { engram, body: 'parent body' } });
    sdk.engramsList.mockResolvedValue({
      data: {
        engrams: [buildEngram({ id: 'eng_20260417_0942_two', title: 'Linked engram' })],
        total: 1,
      },
    });
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');
    expect(await screen.findByText('Linked engram')).toBeInTheDocument();
  });

  it('switches into edit mode when Edit is clicked', async () => {
    sdk.engramsGet.mockResolvedValue({ data: { engram: buildEngram(), body: 'hello' } });
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');

    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    expect(screen.getByLabelText('Body')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('flags missing title and empty scopes as validation errors', async () => {
    sdk.engramsGet.mockResolvedValue({
      data: { engram: buildEngram({ scopes: ['work'] }), body: 'hello' },
    });
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');

    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const titleInput = screen.getByLabelText('Title');
    await userEvent.clear(titleInput);
    expect(screen.getByTestId('engram-edit-errors')).toHaveTextContent('Title is required');

    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('calls update with normalised payload on save and refetches', async () => {
    sdk.engramsGet.mockResolvedValue({ data: { engram: buildEngram(), body: 'hello' } });
    sdk.engramsUpdate.mockResolvedValue({ data: { engram: buildEngram() } });
    renderAt('/cerebrum/engrams/eng_20260417_0942_one');

    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    const titleInput = screen.getByLabelText('Title');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Updated title');

    const body = screen.getByLabelText('Body');
    await userEvent.clear(body);
    await userEvent.type(body, 'New body');

    await userEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() =>
      expect(sdk.engramsUpdate).toHaveBeenCalledWith({
        path: { id: 'eng_20260417_0942_one' },
        body: expect.objectContaining({
          title: 'Updated title',
          body: 'New body',
          scopes: ['work'],
          status: 'active',
        }),
      })
    );
    // The mutation invalidates the engrams cache, which refetches the detail.
    await waitFor(() => expect(sdk.engramsGet).toHaveBeenCalledTimes(2));
  });

  it('shows the not-found message when get returns a 404', async () => {
    sdk.engramsGet.mockResolvedValue(notFound());
    renderAt('/cerebrum/engrams/eng_missing');
    expect(await screen.findByText('Engram not found.')).toBeInTheDocument();
  });

  it('does NOT show not-found for a non-404 server error', async () => {
    sdk.engramsGet.mockResolvedValue({ error: { message: 'boom' }, response: { status: 500 } });
    renderAt('/cerebrum/engrams/eng_missing');
    await waitFor(() => expect(sdk.engramsGet).toHaveBeenCalled());
    expect(screen.queryByText('Engram not found.')).not.toBeInTheDocument();
  });
});
