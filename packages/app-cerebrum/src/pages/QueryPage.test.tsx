/**
 * Tests for the Cerebrum Query page (PRD-082).
 *
 * Validates the integration between the page-level state machine and the
 * SSE streaming endpoint mounted at `/api/cerebrum/query/stream`
 * (issue #2596). The `fetch` global is replaced with a mock that emits a
 * canned stream of `token` and `done` events; we assert the panel updates
 * progressively as tokens arrive and that the citation set is appended
 * once the `done` event lands.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

const mockEmitMutate = vi.fn();
let emitPending = false;
let emitCallbacks: { onSuccess?: (data: unknown) => void; onError?: (err: unknown) => void } = {};

vi.mock('@pops/api-client', () => ({
  trpc: {
    cerebrum: {
      emit: {
        generate: {
          useMutation: (cb: typeof emitCallbacks) => {
            emitCallbacks = cb;
            return {
              mutate: (...args: unknown[]) => mockEmitMutate(...args),
              isPending: emitPending,
              error: null,
            };
          },
        },
      },
    },
  },
}));

import { QueryPage } from './QueryPage';

const STORAGE_KEY = 'pops.cerebrum.query-history';

interface StreamEvent {
  type: 'token' | 'done' | 'error';
  [key: string]: unknown;
}

/** Build a streaming Response whose body emits the provided SSE events. */
function makeStreamResponse(events: StreamEvent[]): Response {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.close();
    },
  });
  return new Response(body, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

const fetchMock = vi.fn();

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  emitPending = false;
  emitCallbacks = {};
  window.localStorage.clear();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('QueryPage', () => {
  it('renders the header, form, history-empty and answer-empty states', () => {
    renderPage();
    expect(screen.getByText('Query')).toBeInTheDocument();
    expect(screen.getByTestId('query-empty')).toBeInTheDocument();
    expect(screen.getByTestId('query-history-empty')).toBeInTheDocument();
  });

  it('rejects an empty question with a toast and does not call the stream endpoint', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('query-ask'));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('A question is required.');
  });

  it('progressively updates the panel as token events arrive then appends citations on done', async () => {
    fetchMock.mockResolvedValue(
      makeStreamResponse([
        { type: 'token', text: 'You ' },
        { type: 'token', text: 'decided ' },
        { type: 'token', text: 'to ship.' },
        {
          type: 'done',
          answer: 'You decided to ship.',
          sources: [
            {
              id: 'eng_20260417_0942_decide',
              type: 'engram',
              title: 'Decision: ship',
              excerpt: 'we will ship on Friday',
              relevance: 0.92,
              scope: 'work.engineering',
            },
            {
              id: 'txn_abc',
              type: 'transaction',
              title: 'Hosting bill',
              excerpt: 'monthly invoice',
              relevance: 0.55,
              scope: 'work.ops',
            },
          ],
          scopes: ['work.*'],
          confidence: 'high',
          tokensIn: 50,
          tokensOut: 25,
        },
      ])
    );

    renderPage();
    await userEvent.type(screen.getByLabelText('Question'), 'what did i decide?');
    await userEvent.click(screen.getByTestId('query-ask'));

    await waitFor(() => {
      expect(screen.getByText('You decided to ship.')).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/cerebrum/query/stream',
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
    );
    const fetchCall = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(fetchCall[1].body)).toEqual({ question: 'what did i decide?' });

    expect(screen.getByTestId('query-answer')).toBeInTheDocument();
    const link = screen.getByTestId('query-source-link');
    expect(link).toHaveAttribute('href', '/cerebrum/engrams/eng_20260417_0942_decide');
    expect(screen.getByTestId('query-confidence').textContent).toContain('High');
    expect(screen.getByTestId('query-history-entry')).toBeInTheDocument();
    const persisted: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(Array.isArray(persisted)).toBe(true);
  });

  it('renders intermediate token text before the done event arrives', async () => {
    const encoder = new TextEncoder();
    let controllerRef: ReadableStreamDefaultController<Uint8Array> | null = null;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controllerRef = controller;
      },
    });
    fetchMock.mockResolvedValue(
      new Response(body, { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    );

    renderPage();
    await userEvent.type(screen.getByLabelText('Question'), 'progressive?');
    await userEvent.click(screen.getByTestId('query-ask'));

    // Flush the first token.
    await act(async () => {
      controllerRef?.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'token', text: 'Partial' })}\n\n`)
      );
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText('Partial')).toBeInTheDocument();
    });

    // Flush another token; the panel should now show the cumulative text.
    await act(async () => {
      controllerRef?.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'token', text: ' answer' })}\n\n`)
      );
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByText('Partial answer')).toBeInTheDocument();
    });

    // Finish the stream.
    await act(async () => {
      controllerRef?.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({
            type: 'done',
            answer: 'Partial answer',
            sources: [],
            scopes: [],
            confidence: 'low',
            tokensIn: 0,
            tokensOut: 0,
          })}\n\n`
        )
      );
      controllerRef?.close();
      await Promise.resolve();
    });
    await waitFor(() => {
      expect(screen.getByTestId('query-confidence').textContent).toContain('Low');
    });
  });

  it('surfaces an error toast when the SSE pipeline emits an error event', async () => {
    fetchMock.mockResolvedValue(makeStreamResponse([{ type: 'error', message: 'boom' }]));

    renderPage();
    await userEvent.type(screen.getByLabelText('Question'), 'broken?');
    await userEvent.click(screen.getByTestId('query-ask'));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('boom');
    });
    expect(screen.getByTestId('query-error')).toBeInTheDocument();
  });

  it('surfaces an error toast when fetch itself rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    renderPage();
    await userEvent.type(screen.getByLabelText('Question'), 'down?');
    await userEvent.click(screen.getByTestId('query-ask'));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith('network down');
    });
  });

  it('re-runs a past query against the streaming endpoint when clicked in history', async () => {
    fetchMock.mockResolvedValue(
      makeStreamResponse([
        {
          type: 'done',
          answer: 'replayed',
          sources: [],
          scopes: ['work.*'],
          confidence: 'low',
          tokensIn: 0,
          tokensOut: 0,
        },
      ])
    );
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        {
          id: '42',
          submittedAt: '2026-05-10T01:00:00Z',
          question: 'replay me',
          scopes: ['work.*'],
          domains: ['engrams'],
          includeSecret: true,
          lastConfidence: 'medium',
          lastSourceCount: 3,
        },
      ])
    );
    renderPage();
    await userEvent.click(screen.getByTestId('query-history-rerun'));
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    const fetchCall = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(fetchCall[0]).toBe('/api/cerebrum/query/stream');
    expect(JSON.parse(fetchCall[1].body)).toEqual({
      question: 'replay me',
      scopes: ['work.*'],
      domains: ['engrams'],
      includeSecret: true,
    });
  });

  it('dispatches save-as-document via the emit pipeline once an answer has streamed', async () => {
    fetchMock.mockResolvedValue(
      makeStreamResponse([
        {
          type: 'done',
          answer: 'answer',
          sources: [],
          scopes: ['work.engineering'],
          confidence: 'low',
          tokensIn: 0,
          tokensOut: 0,
        },
      ])
    );

    renderPage();
    await userEvent.type(screen.getByLabelText('Question'), 'topic q');
    await userEvent.type(screen.getByLabelText('Scopes (comma-separated)'), 'work.engineering');
    await userEvent.click(screen.getByTestId('query-ask'));
    await waitFor(() => {
      expect(screen.getByTestId('query-answer')).toBeInTheDocument();
    });
    await userEvent.click(screen.getByTestId('query-save-document'));
    expect(mockEmitMutate).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'report',
        query: 'topic q',
        scopes: ['work.engineering'],
      })
    );
    act(() => {
      emitCallbacks.onSuccess?.({ document: { title: 'Saved doc' } });
    });
    expect(toastSuccessMock).toHaveBeenCalled();
  });
});
