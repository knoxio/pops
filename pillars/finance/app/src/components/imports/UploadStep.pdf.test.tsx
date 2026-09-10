/**
 * The upload step's PDF branch.
 *
 * The statement bytes here are built by `pdf/synthetic-pdf.test-helpers.ts` on
 * a column grid this repository invented — see that file's header. What these
 * assert is the wiring: which screen appears, what the store ends up holding,
 * and that nothing is imported before the findings have been shown.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { type ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../store/importStore';
import { monospacedTextPdf, passwordProtectedPdf } from './pdf/synthetic-pdf.test-helpers';
import { UploadStep } from './UploadStep';

import type { PlacedText } from './pdf/synthetic-pdf.test-helpers';

// These tests are about the PDF-statement branch, not the account picker
// (POPS-2840) — see UploadStep.test.tsx for the same rationale.
// The continue-where-you-left-off panel has its own suite; here it would only
// need a router and the drafts route for a step these tests never touch.
vi.mock('./upload-step/ContinuePending', () => ({ ContinuePending: () => null }));

vi.mock('../../finance-api/index.js', () => ({
  accountsList: async () => ({ data: { data: [], pagination: { total: 0 } } }),
  currenciesList: async () => ({ data: { data: [] } }),
}));

function renderUploadStep(): ReactElement {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <UploadStep />
    </QueryClientProvider>
  );
}

beforeEach(() => {
  useImportStore.getState().reset();
  useImportStore.getState().setAccount('acc-1', 'Test ANZ Credit Card');
  useImportStore.getState().setDialectId('ANZ Credit Card');
});

function row(line: number, merchant: string, amount: string, balance: string): PlacedText[] {
  return [
    { row: line, column: 0, text: '01/03/2024' },
    { row: line, column: 12, text: '28/02/2024' },
    { row: line, column: 24, text: '4321' },
    { row: line, column: 30, text: merchant },
    { row: line, column: 56, text: 'MARRICKVILLE' },
    { row: line, column: 76, text: amount },
    { row: line, column: 88, text: balance },
  ];
}

function statementBytes(): Uint8Array {
  return monospacedTextPdf([row(2, 'ALDI STORES - MARRICKV', '42.10', '1,234.56')]);
}

function pdfFile(bytes: Uint8Array, name = 'statement.pdf'): File {
  return new File([bytes as BlobPart], name, { type: 'application/pdf' });
}

function selectFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText('Upload CSV or PDF files'), { target: { files } });
}

function clickPrimary() {
  fireEvent.click(screen.getByRole('button', { name: /Next|Processing|Import/ }));
}

describe('UploadStep — ANZ credit-card PDF statements', () => {
  it('offers PDF alongside CSV only for the credit card', () => {
    render(renderUploadStep());
    expect(screen.getByLabelText('Upload CSV or PDF files')).toHaveAttribute('accept', '.csv,.pdf');
  });

  it('does not offer PDF for a bank with no PDF reader behind it', () => {
    useImportStore.getState().setDialectId('Amex');
    render(renderUploadStep());
    expect(screen.getByLabelText('Upload CSV files')).toHaveAttribute('accept', '.csv');
  });

  it('rejects a PDF dropped on a bank that only takes CSV', () => {
    useImportStore.getState().setDialectId('ING');
    render(renderUploadStep());

    fireEvent.change(screen.getByLabelText('Upload CSV files'), {
      target: { files: [pdfFile(statementBytes())] },
    });

    expect(screen.getByText('statement.pdf: not a CSV file.')).toBeInTheDocument();
  });

  it('shows what it found and imports nothing until that is confirmed', async () => {
    render(renderUploadStep());
    selectFiles([pdfFile(statementBytes())]);
    clickPrimary();

    await screen.findByText(/Read 1 transaction from 1 page across 1 file/);
    expect(screen.getByText('Overlap with existing transactions was not checked')).toBeVisible();
    expect(useImportStore.getState().currentStep).toBe(1);
    expect(useImportStore.getState().parsedTransactions).toEqual([]);
  });

  it('imports on the second press, straight to the processing step', async () => {
    render(renderUploadStep());
    selectFiles([pdfFile(statementBytes())]);
    clickPrimary();

    const confirm = await screen.findByRole('button', { name: 'Import 1 transaction' });
    fireEvent.click(confirm);

    await waitFor(() => expect(useImportStore.getState().currentStep).toBe(3));
    const { parsedTransactions } = useImportStore.getState();
    expect(parsedTransactions).toHaveLength(1);
    expect(parsedTransactions[0]).toMatchObject({
      description: 'ALDI STORES - MARRICKV',
      amount: -42.1,
      dialectAccountLabel: 'ANZ Credit Card',
    });
  });

  it('puts a line it could not read in front of the person before importing', async () => {
    const brokenRow: PlacedText[] = [
      { row: 4, column: 0, text: '07/03/2024' },
      { row: 4, column: 12, text: '05/03/2024' },
      { row: 4, column: 24, text: '4321' },
      { row: 4, column: 30, text: 'COFFEE SUPPLY CO' },
      { row: 4, column: 76, text: '8.50' },
    ];
    const bytes = monospacedTextPdf([
      [...row(2, 'ALDI STORES - MARRICKV', '42.10', '1,234.56'), ...brokenRow],
    ]);

    render(renderUploadStep());
    selectFiles([pdfFile(bytes)]);
    clickPrimary();

    await screen.findByText('1 line on the statement could not be read');
    const listed = screen.getByRole('list', { name: 'Unreadable statement lines' });
    expect(listed).toHaveTextContent('COFFEE SUPPLY CO');
    expect(useImportStore.getState().currentStep).toBe(1);
  });

  it('refuses to read a batch that mixes the two formats', async () => {
    render(renderUploadStep());
    selectFiles([
      new File(['Date,Amount\n'], 'export.csv', { type: 'text/csv' }),
      pdfFile(statementBytes()),
    ]);
    clickPrimary();

    await screen.findByText(/Select either CSV exports or PDF statements, not both/);
    expect(useImportStore.getState().currentStep).toBe(1);
  });

  it('says what to do about a locked statement instead of failing blankly', async () => {
    render(renderUploadStep());
    selectFiles([pdfFile(passwordProtectedPdf(), 'locked.pdf')]);
    clickPrimary();

    await screen.findByText(/locked\.pdf: this PDF is password-protected/);
    expect(useImportStore.getState().currentStep).toBe(1);
  });

  it('names a PDF that is a scan rather than importing nothing from it', async () => {
    const scanned = monospacedTextPdf([[]]);
    render(renderUploadStep());
    selectFiles([pdfFile(scanned, 'scan.pdf')]);
    clickPrimary();

    await screen.findByText(/scan\.pdf: this PDF has no text on it/);
    expect(useImportStore.getState().currentStep).toBe(1);
  });
});
