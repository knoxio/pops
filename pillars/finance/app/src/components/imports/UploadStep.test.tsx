import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Papa from 'papaparse';
import { type ReactElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useImportStore } from '../../store/importStore';
import { UploadStep } from './UploadStep';

// These tests are about parsing/merging behaviour, not the account picker
// (POPS-2840) — accounts/currencies default to empty lists so
// `AccountAndFormatFields` never makes a real network call, and every test
// pre-selects an account directly on the store so the file-parsing UI it now
// gates stays reachable. One test below (the format-derivation gate,
// POPS-2854) overrides the account list for the one case that needs the
// format picker's radio to actually be on screen.
const accountsList = vi.fn();
const currenciesList = vi.fn();
const accountsCreate = vi.fn();
const entitiesList = vi.fn();
const entitiesCreate = vi.fn();

// The continue-where-you-left-off panel has its own suite; here it would only
// need a router and the drafts route for a step these tests never touch.
vi.mock('./upload-step/ContinuePending', () => ({ ContinuePending: () => null }));

vi.mock('../../finance-api/index.js', () => ({
  accountsList: (...args: unknown[]) => accountsList(...args),
  currenciesList: (...args: unknown[]) => currenciesList(...args),
  accountsCreate: (...args: unknown[]) => accountsCreate(...args),
  giftCardDetailsWrite: vi.fn(),
}));

vi.mock('../../contacts-api/index.js', () => ({
  entitiesList: (...args: unknown[]) => entitiesList(...args),
  entitiesCreate: (...args: unknown[]) => entitiesCreate(...args),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
  useImportStore.getState().setAccount('acc-1', 'Test Account');
  accountsList.mockResolvedValue({ data: { data: [], pagination: { total: 0 } } });
  currenciesList.mockResolvedValue({ data: { data: [] } });
  entitiesList.mockResolvedValue({
    data: { data: [], pagination: { total: 0, limit: 200, offset: 0, hasMore: false } },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('UploadStep — resumed run without a re-attached file', () => {
  it('advances on Next without re-parsing when parsed rows already exist', () => {
    const parseSpy = vi.spyOn(Papa, 'parse');
    useImportStore.getState().setHeaders(['Date', 'Amount']);
    useImportStore.getState().setRows([{ Date: '01/01/2026', Amount: '-10.00' }]);

    render(renderUploadStep());

    expect(
      screen.getByText(
        "Your files aren't re-attached after resuming — the parsed rows are preserved. Selecting any file starts a fresh import."
      )
    ).toBeInTheDocument();

    const next = screen.getByRole('button', { name: 'Next' });
    expect(next).toBeEnabled();
    fireEvent.click(next);

    expect(useImportStore.getState().currentStep).toBe(2);
    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('keeps Next disabled and shows no resume notice with neither file nor rows', () => {
    render(renderUploadStep());

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
    expect(screen.queryByText(/re-attached after resuming/)).not.toBeInTheDocument();
  });
});

function csvFile(name: string, contents: string): File {
  return new File([contents], name, { type: 'text/csv' });
}

function selectFiles(files: File[]) {
  fireEvent.change(screen.getByLabelText('Upload CSV files'), { target: { files } });
}

function clickNext() {
  fireEvent.click(screen.getByRole('button', { name: /Next|Processing/ }));
}

const JAN = 'Date,Description,Amount\n01/01/2026,Rent,-900.00\n31/01/2026,Coffee,-4.50\n';
const FEB = 'Date,Description,Amount\n31/01/2026,Coffee,-4.50\n02/02/2026,Rent,-900.00\n';

describe('UploadStep — merging several CSVs', () => {
  it('merges same-schema files into one row list and advances', async () => {
    render(renderUploadStep());

    selectFiles([csvFile('jan.csv', JAN), csvFile('feb.csv', FEB)]);
    clickNext();

    await waitFor(() => expect(useImportStore.getState().currentStep).toBe(2));
    const state = useImportStore.getState();
    expect(state.headers).toEqual(['Date', 'Description', 'Amount']);
    // Three distinct transactions: the 31/01 coffee appears in both exports.
    expect(state.rows).toHaveLength(3);
    expect(state.sourceFileNames).toEqual(['jan.csv', 'feb.csv']);
  });

  it('refuses to advance and names the file whose columns differ', async () => {
    render(renderUploadStep());

    selectFiles([
      csvFile('jan.csv', JAN),
      csvFile('other.csv', 'Date,Amount\n01/03/2026,-12.00\n'),
    ]);
    clickNext();

    expect(
      await screen.findByText(/"other\.csv" has different columns to "jan\.csv"/)
    ).toBeInTheDocument();
    expect(useImportStore.getState().currentStep).toBe(1);
    expect(useImportStore.getState().rows).toEqual([]);
  });

  it('reports which file failed to parse rather than failing anonymously', async () => {
    render(renderUploadStep());

    selectFiles([csvFile('jan.csv', JAN), csvFile('empty.csv', 'Date,Description,Amount\n')]);
    clickNext();

    expect(await screen.findByText(/empty\.csv: CSV file is empty/)).toBeInTheDocument();
    expect(useImportStore.getState().currentStep).toBe(1);
  });
});

describe('UploadStep — an ANZ transaction-account export', () => {
  it('imports every line rather than losing the first charge to the header row', async () => {
    // Unlike the other tests in this file, this one needs the format radio
    // itself on screen to pick 'ANZ' — so, just this once, the account list
    // resolves to a real ANZ checking account (POPS-2854), carrying its
    // server-resolved issuer entity (POPS-3063) so the format picker
    // resolves a bank name with no separate entity fetch.
    accountsList.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'acc-1',
            name: 'Test Account',
            kind: 'checking',
            currency: 'AUD',
            archivedAt: null,
            displayOrder: 0,
            entityId: 'entity-anz',
            entityDisplayName: 'ANZ',
            entityDisplayNameStale: false,
            entityColour: '#0072ac',
            entityAvatarAssetId: null,
            resolvedEntityId: 'entity-anz',
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
      },
    });

    const lineCount = 556;
    const contents =
      Array.from(
        { length: lineCount },
        (_unused, index) => `01/07/2026,-${(index + 1).toFixed(2)},MERCHANT ${index + 1},,,,,`
      ).join('\r\n') + '\r\n';

    render(renderUploadStep());

    // ANZ transaction accounts use the same headerless CSV layout as ANZ cards.
    const anz = await screen.findByRole('radio', { name: 'ANZ' });
    fireEvent.click(anz);
    selectFiles([csvFile('anz.csv', contents)]);
    clickNext();

    await waitFor(() => expect(useImportStore.getState().currentStep).toBe(2));
    const state = useImportStore.getState();
    expect(state.rows).toHaveLength(lineCount);
    expect(state.headers).not.toContain('MERCHANT 1');
    expect(state.rows[0]).toMatchObject({ Description: 'MERCHANT 1' });
  });
});

describe('UploadStep — an account with no derivable import format (POPS-2854)', () => {
  it('hides the file drop and keeps Next disabled instead of parsing under a stale bank', async () => {
    // A cash account has no statement to export — `bankTypesForAccount`
    // returns no formats for it, and `AccountAndFormatFields` shows the
    // "Nothing to import" alert. The file drop and Next must agree with that
    // rather than staying active under whatever `dialectId` the store
    // defaulted to.
    accountsList.mockResolvedValueOnce({
      data: {
        data: [
          {
            id: 'acc-1',
            name: 'Test Account',
            kind: 'cash',
            currency: 'AUD',
            archivedAt: null,
            displayOrder: 0,
            entityId: null,
            entityDisplayName: null,
            entityDisplayNameStale: false,
            entityColour: null,
            entityAvatarAssetId: null,
            resolvedEntityId: null,
            createdAt: '2026-01-01T00:00:00.000Z',
            updatedAt: '2026-01-01T00:00:00.000Z',
          },
        ],
        pagination: { total: 1, limit: 500, offset: 0, hasMore: false },
      },
    });

    render(renderUploadStep());

    expect(await screen.findByText('Nothing to import into Test Account')).toBeInTheDocument();
    expect(screen.queryByLabelText('Upload CSV or PDF files')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Upload CSV files')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });
});

function selectFilesTakingPdf(files: File[]) {
  fireEvent.change(screen.getByLabelText('Upload CSV or PDF files'), { target: { files } });
}

describe('UploadStep — a file that does not match the chosen bank', () => {
  it('names the header row it found and blocks the import until it is resolved', async () => {
    useImportStore.getState().setDialectId('ANZ Credit Card');
    render(renderUploadStep());

    selectFilesTakingPdf([
      csvFile('wrong.csv', 'Date,Description,Amount\n01/01/2026,Rent,-900.00\n'),
    ]);
    clickNext();

    expect(await screen.findByText('This does not look like ANZ Credit Card')).toBeInTheDocument();
    expect(screen.getByText('Date,Description,Amount')).toBeInTheDocument();
    expect(useImportStore.getState().currentStep).toBe(1);
    expect(useImportStore.getState().rows).toEqual([]);
  });

  it('clears the mismatch and the file when choosing another file instead', async () => {
    useImportStore.getState().setDialectId('ANZ Credit Card');
    render(renderUploadStep());

    selectFilesTakingPdf([
      csvFile('wrong.csv', 'Date,Description,Amount\n01/01/2026,Rent,-900.00\n'),
    ]);
    clickNext();
    await screen.findByText('This does not look like ANZ Credit Card');

    fireEvent.click(screen.getByRole('button', { name: 'Choose another file' }));

    expect(screen.queryByText('This does not look like ANZ Credit Card')).not.toBeInTheDocument();
    expect(useImportStore.getState().files).toEqual([]);
  });
});

describe('UploadStep — creating an account mid-import (POPS-2820)', () => {
  it('keeps the already-chosen file selected once the new account is created', async () => {
    // Same shape as the "no derivable format" fixture, but a real ANZ
    // checking account so the format radio (and therefore the file drop) is
    // on screen before the account switch happens.
    const anzAccount = {
      id: 'acc-1',
      name: 'Test Account',
      kind: 'checking' as const,
      currency: 'AUD',
      archivedAt: null,
      displayOrder: 0,
      entityId: 'entity-anz',
      entityDisplayName: 'ANZ',
      entityDisplayNameStale: false,
      entityColour: '#0072ac',
      entityAvatarAssetId: null,
      resolvedEntityId: 'entity-anz',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    accountsList.mockResolvedValue({
      data: { data: [anzAccount], pagination: { total: 1, limit: 500, offset: 0, hasMore: false } },
    });
    currenciesList.mockResolvedValue({
      data: {
        data: [{ code: 'AUD', name: 'Australian Dollar', symbol: '$', decimals: 2, kind: 'fiat' }],
      },
    });
    accountsCreate.mockResolvedValue({
      data: {
        data: { ...anzAccount, id: 'acc-new', name: 'Bendigo Everyday' },
        message: 'Created',
      },
      error: undefined,
    });

    const user = userEvent.setup();
    render(renderUploadStep());

    const file = csvFile('jan.csv', JAN);
    selectFiles([file]);
    expect(useImportStore.getState().files).toEqual([file]);

    await user.click(await screen.findByRole('button', { name: /add the account/i }));
    const dialog = within(await screen.findByRole('dialog'));
    await user.type(dialog.getByPlaceholderText('Everyday'), 'Bendigo Everyday');
    await user.click(dialog.getByRole('combobox', { name: 'Currency' }));
    await user.click(await screen.findByText('AUD — Australian Dollar'));
    await user.click(dialog.getByRole('button', { name: 'Create account' }));

    await waitFor(() => expect(useImportStore.getState().accountId).toBe('acc-new'));
    expect(useImportStore.getState().files).toEqual([file]);
  });
});
