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

const mockGenerateMutate = vi.fn();
const mockPreviewCall = vi.fn();
let generatePending = false;
let generateCallbacks: { onSuccess?: (data: unknown) => void; onError?: (err: unknown) => void } =
  {};

vi.mock('@pops/pillar-sdk/react', () => ({
  usePillarMutation: (_pillarId: string, path: readonly string[], cb: typeof generateCallbacks) => {
    const key = path.join('.');
    if (key === 'emit.generate') {
      generateCallbacks = cb;
      return {
        mutate: (...args: unknown[]) => mockGenerateMutate(...args),
        isPending: generatePending,
        error: null,
      };
    }
    throw new Error(`Unexpected pillar mutation: ${key}`);
  },
}));

vi.mock('../lib/pillar-call', () => ({
  usePillarCall: () => async (_pillarId: string, _path: readonly string[], input: unknown) => {
    const value = await mockPreviewCall(input);
    return { kind: 'ok', value };
  },
}));

import { DocumentsPage } from './DocumentsPage';

function renderPage() {
  return render(
    <MemoryRouter>
      <DocumentsPage />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  generatePending = false;
  generateCallbacks = {};
  mockPreviewCall.mockResolvedValue({ sources: [], outline: 'outline' });
});

describe('DocumentsPage', () => {
  it('renders the form, preview empty state and result empty state', () => {
    renderPage();
    expect(screen.getByText('Documents')).toBeInTheDocument();
    expect(screen.getByTestId('documents-preview-empty')).toBeInTheDocument();
    expect(screen.getByTestId('documents-result-empty')).toBeInTheDocument();
  });

  it('rejects report mode without a query and surfaces a toast', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: /^generate$/i }));
    expect(mockGenerateMutate).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('Query is required for report mode.');
  });

  it('calls preview fetch with the parsed payload', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('Query'), 'agents');
    await userEvent.click(screen.getByRole('button', { name: /preview/i }));
    expect(mockPreviewCall).toHaveBeenCalledWith({ mode: 'report', query: 'agents' });
  });

  it('renders the generated document when the mutation succeeds', () => {
    renderPage();
    act(() => {
      generateCallbacks.onSuccess?.({
        document: {
          title: 'Report on agents',
          body: '# Findings',
          mode: 'report',
          sources: [
            {
              id: 'eng_1',
              type: 'engram',
              title: 'Source',
              excerpt: 'x',
              relevance: 1,
              scope: 'work',
            },
          ],
          audienceScope: 'work.*',
          dateRange: null,
          metadata: {
            sourceCount: 1,
            dateRange: null,
            scopeCoverage: ['work'],
            mode: 'report',
            truncated: false,
          },
        },
        notice: undefined,
      });
    });
    expect(screen.getByTestId('documents-result')).toBeInTheDocument();
    expect(screen.getByText('Report on agents')).toBeInTheDocument();
  });

  it('surfaces a notice when generation returns no document', () => {
    renderPage();
    act(() => {
      generateCallbacks.onSuccess?.({ document: null, notice: 'No matching sources.' });
    });
    expect(screen.getByTestId('documents-result-notice')).toBeInTheDocument();
  });

  it('surfaces an error toast when generation fails', () => {
    renderPage();
    act(() => {
      generateCallbacks.onError?.(new Error('Generation failed'));
    });
    expect(toastErrorMock).toHaveBeenCalledWith('Generation failed');
    expect(screen.getByTestId('documents-result-empty')).toBeInTheDocument();
  });
});
