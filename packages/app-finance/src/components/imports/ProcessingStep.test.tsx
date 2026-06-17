import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockProcessImport, mockGetImportProgress } = vi.hoisted(() => ({
  mockProcessImport: vi.fn(),
  mockGetImportProgress: vi.fn(),
}));

vi.mock('../../finance-api/index.js', () => ({
  importsProcessImport: (...args: unknown[]) => mockProcessImport(...args),
  importsGetImportProgress: (...args: unknown[]) => mockGetImportProgress(...args),
}));

const mockNextStep = vi.fn();
const mockSetProcessSessionId = vi.fn();
const mockSetProcessedTransactions = vi.fn();

const emptyProcessed = {
  matched: [],
  uncertain: [],
  failed: [],
  skipped: [],
  warnings: undefined,
};

let mockProcessedTransactions: typeof emptyProcessed = emptyProcessed;
let mockParsedTransactionsFingerprint = 'fp-current';
let mockProcessedForFingerprint: string | null = null;
let mockProcessSessionId: string | null = null;

vi.mock('../../store/importStore', () => ({
  useImportStore: () => ({
    parsedTransactions: [{ date: '2026-01-01', description: 'Test', amount: -50 }],
    parsedTransactionsFingerprint: mockParsedTransactionsFingerprint,
    processedForFingerprint: mockProcessedForFingerprint,
    processedTransactions: mockProcessedTransactions,
    setProcessSessionId: mockSetProcessSessionId,
    processSessionId: mockProcessSessionId,
    setProcessedTransactions: mockSetProcessedTransactions,
    nextStep: mockNextStep,
  }),
}));

import { ProcessingStep } from './ProcessingStep';

function renderStep(): ReactElement {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={queryClient}>
      <ProcessingStep />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockProcessImport.mockResolvedValue({ data: { sessionId: 'sess-1' }, error: undefined });
  mockGetImportProgress.mockResolvedValue({
    data: null,
    error: undefined,
  });
  mockProcessedTransactions = emptyProcessed;
  mockParsedTransactionsFingerprint = 'fp-current';
  mockProcessedForFingerprint = null;
  mockProcessSessionId = null;
});

describe('ProcessingStep', () => {
  it('auto-triggers processImport on mount with the parsed transactions as the body', async () => {
    render(renderStep());
    await waitFor(() =>
      expect(mockProcessImport).toHaveBeenCalledWith({
        body: {
          transactions: [{ date: '2026-01-01', description: 'Test', amount: -50 }],
          account: 'Amex',
        },
      })
    );
  });

  it('shows Retry button when the processImport mutation fails', async () => {
    mockProcessImport.mockResolvedValue({
      data: undefined,
      error: { message: 'Network error' },
      response: { status: 500 } as Response,
    });
    render(renderStep());
    expect(await screen.findByText('Processing Failed')).toBeInTheDocument();
    expect(screen.getByText('Network error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('re-issues processImport when Retry is clicked', async () => {
    mockProcessImport.mockResolvedValue({
      data: undefined,
      error: { message: 'Network error' },
      response: { status: 500 } as Response,
    });
    render(renderStep());
    const retry = await screen.findByRole('button', { name: 'Retry' });
    fireEvent.click(retry);
    await waitFor(() => expect(mockProcessImport).toHaveBeenCalledTimes(2));
    expect(mockProcessImport).toHaveBeenLastCalledWith({
      body: {
        transactions: [{ date: '2026-01-01', description: 'Test', amount: -50 }],
        account: 'Amex',
      },
    });
  });

  it('shows Retry button when the progress query reports a failed status', async () => {
    mockProcessSessionId = 'sess-1';
    mockGetImportProgress.mockResolvedValue({
      data: {
        sessionId: 'sess-1',
        status: 'failed',
        errors: [{ description: 'x', error: 'Server crashed' }],
        currentBatch: [],
        currentStep: 'matching',
        processedCount: 0,
        startedAt: '2026-01-01T00:00:00.000Z',
        totalTransactions: 1,
      },
      error: undefined,
    });
    render(renderStep());
    expect(await screen.findByText('Processing Failed')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  describe('when already processed (Back navigation)', () => {
    it('does NOT re-run the AI pipeline and shows Continue instead (fingerprints match)', async () => {
      mockProcessedTransactions = {
        ...emptyProcessed,
        matched: [{ description: 'Existing' } as never],
      };
      mockParsedTransactionsFingerprint = 'fp-same';
      mockProcessedForFingerprint = 'fp-same';
      render(renderStep());
      expect(screen.getByText('Already processed')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue to Review' })).toBeInTheDocument();
      // Give react-query a tick — the pipeline must remain idle.
      await waitFor(() => expect(mockProcessImport).not.toHaveBeenCalled());
    });

    it('calls nextStep when Continue is clicked', () => {
      mockProcessedTransactions = {
        ...emptyProcessed,
        uncertain: [{ description: 'Existing' } as never],
      };
      mockParsedTransactionsFingerprint = 'fp-same';
      mockProcessedForFingerprint = 'fp-same';
      render(renderStep());
      fireEvent.click(screen.getByRole('button', { name: 'Continue to Review' }));
      expect(mockNextStep).toHaveBeenCalledTimes(1);
    });

    it('DOES re-run the pipeline when the parsed fingerprint has diverged from processedForFingerprint', async () => {
      mockProcessedTransactions = {
        ...emptyProcessed,
        matched: [{ description: 'Stale' } as never],
      };
      mockParsedTransactionsFingerprint = 'fp-new';
      mockProcessedForFingerprint = 'fp-old';
      render(renderStep());
      expect(screen.queryByText('Already processed')).not.toBeInTheDocument();
      await waitFor(() => expect(mockProcessImport).toHaveBeenCalledTimes(1));
    });

    it('DOES re-run the pipeline when processedForFingerprint is still null (first run)', async () => {
      mockProcessedTransactions = emptyProcessed;
      mockParsedTransactionsFingerprint = 'fp-current';
      mockProcessedForFingerprint = null;
      render(renderStep());
      expect(screen.queryByText('Already processed')).not.toBeInTheDocument();
      await waitFor(() => expect(mockProcessImport).toHaveBeenCalledTimes(1));
    });
  });
});
