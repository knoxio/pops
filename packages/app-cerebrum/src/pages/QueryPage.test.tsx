import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

const mockAskMutate = vi.fn();
const mockEmitMutate = vi.fn();
let askPending = false;
let emitPending = false;
let askCallbacks: { onSuccess?: (data: unknown) => void; onError?: (err: unknown) => void } = {};
let emitCallbacks: { onSuccess?: (data: unknown) => void; onError?: (err: unknown) => void } = {};

vi.mock('@pops/api-client', () => ({
  trpc: {
    cerebrum: {
      query: {
        ask: {
          useMutation: (cb: typeof askCallbacks) => {
            askCallbacks = cb;
            return {
              mutate: (...args: unknown[]) => mockAskMutate(...args),
              isPending: askPending,
              error: null,
            };
          },
        },
      },
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

function renderPage() {
  return render(
    <MemoryRouter>
      <QueryPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  askPending = false;
  emitPending = false;
  askCallbacks = {};
  emitCallbacks = {};
  window.localStorage.clear();
});

describe('QueryPage', () => {
  it('renders the header, form, history-empty and answer-empty states', () => {
    renderPage();
    expect(screen.getByText('Query')).toBeInTheDocument();
    expect(screen.getByTestId('query-empty')).toBeInTheDocument();
    expect(screen.getByTestId('query-history-empty')).toBeInTheDocument();
  });

  it('rejects an empty question with a toast and does not call the mutation', async () => {
    renderPage();
    await userEvent.click(screen.getByTestId('query-ask'));
    expect(mockAskMutate).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('A question is required.');
  });

  it('submits a question, persists history, and renders the answer with engram citation links', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('Question'), 'what did i decide?');
    await userEvent.click(screen.getByTestId('query-ask'));

    expect(mockAskMutate).toHaveBeenCalledWith({ question: 'what did i decide?' });

    act(() => {
      askCallbacks.onSuccess?.({
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
      });
    });

    expect(screen.getByTestId('query-answer')).toBeInTheDocument();
    expect(screen.getByText('You decided to ship.')).toBeInTheDocument();
    const link = screen.getByTestId('query-source-link');
    expect(link).toHaveAttribute('href', '/cerebrum/engrams/eng_20260417_0942_decide');
    expect(screen.getByTestId('query-confidence').textContent).toContain('High');
    expect(screen.getByTestId('query-history-entry')).toBeInTheDocument();
    const persisted: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? '[]');
    expect(Array.isArray(persisted)).toBe(true);
  });

  it('surfaces an error toast when the mutation fails', () => {
    renderPage();
    act(() => {
      askCallbacks.onError?.(new Error('boom'));
    });
    expect(toastErrorMock).toHaveBeenCalledWith('boom');
    expect(screen.getByTestId('query-error')).toBeInTheDocument();
  });

  it('renders the loading skeleton while a request is in flight', () => {
    askPending = true;
    renderPage();
    expect(screen.getByTestId('query-loading')).toBeInTheDocument();
  });

  it('re-runs a past query when clicked in the history sidebar', async () => {
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
    expect(mockAskMutate).toHaveBeenCalledWith({
      question: 'replay me',
      scopes: ['work.*'],
      domains: ['engrams'],
      includeSecret: true,
    });
  });

  it('dispatches save-as-document via the emit pipeline', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('Question'), 'topic q');
    await userEvent.type(screen.getByLabelText('Scopes (comma-separated)'), 'work.engineering');
    await userEvent.click(screen.getByTestId('query-ask'));
    act(() => {
      askCallbacks.onSuccess?.({
        answer: 'answer',
        sources: [],
        scopes: ['work.engineering'],
        confidence: 'low',
      });
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
