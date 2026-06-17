import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { withQueryClient } from '../test-utils';

const toastErrorMock = vi.fn();
const toastSuccessMock = vi.fn();
vi.mock('sonner', () => ({
  toast: {
    error: (...args: unknown[]) => toastErrorMock(...args),
    success: (...args: unknown[]) => toastSuccessMock(...args),
  },
}));

const sdk = vi.hoisted(() => ({
  emitGenerate: vi.fn(),
  emitPreview: vi.fn(),
}));

vi.mock('../cerebrum-api', () => sdk);

import { DocumentsPage } from './DocumentsPage';

const GENERATED_DOCUMENT = {
  title: 'Report on agents',
  body: '# Findings',
  mode: 'report',
  sources: [
    { id: 'eng_1', type: 'engram', title: 'Source', excerpt: 'x', relevance: 1, scope: 'work' },
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
};

function renderPage() {
  return render(
    withQueryClient(
      <MemoryRouter>
        <DocumentsPage />
      </MemoryRouter>
    )
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sdk.emitPreview.mockResolvedValue({ data: { sources: [], outline: 'outline' } });
  sdk.emitGenerate.mockResolvedValue({ data: { document: GENERATED_DOCUMENT, notice: undefined } });
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
    expect(sdk.emitGenerate).not.toHaveBeenCalled();
    expect(toastErrorMock).toHaveBeenCalledWith('Query is required for report mode.');
  });

  it('calls preview fetch with the parsed payload', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('Query'), 'agents');
    await userEvent.click(screen.getByRole('button', { name: /preview/i }));
    await waitFor(() =>
      expect(sdk.emitPreview).toHaveBeenCalledWith({ body: { mode: 'report', query: 'agents' } })
    );
  });

  it('renders the generated document when the mutation succeeds', async () => {
    renderPage();
    await userEvent.type(screen.getByLabelText('Query'), 'agents');
    await userEvent.click(screen.getByRole('button', { name: /^generate$/i }));
    expect(await screen.findByTestId('documents-result')).toBeInTheDocument();
    expect(screen.getByText('Report on agents')).toBeInTheDocument();
  });

  it('surfaces a notice when generation returns no document', async () => {
    sdk.emitGenerate.mockResolvedValue({
      data: { document: null, notice: 'No matching sources.' },
    });
    renderPage();
    await userEvent.type(screen.getByLabelText('Query'), 'agents');
    await userEvent.click(screen.getByRole('button', { name: /^generate$/i }));
    expect(await screen.findByTestId('documents-result-notice')).toBeInTheDocument();
  });

  it('surfaces an error toast when generation fails', async () => {
    sdk.emitGenerate.mockResolvedValue({
      error: { message: 'Generation failed' },
      response: { status: 500 },
    });
    renderPage();
    await userEvent.type(screen.getByLabelText('Query'), 'agents');
    await userEvent.click(screen.getByRole('button', { name: /^generate$/i }));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalledWith('Generation failed'));
    expect(screen.getByTestId('documents-result-empty')).toBeInTheDocument();
  });
});
