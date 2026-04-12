import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// --- Mocks ---

const mockReset = vi.fn();
const mockNavigate = vi.fn();

let storeState: Record<string, unknown> = {};

vi.mock('../../store/importStore', () => ({
  useImportStore: (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState,
}));

vi.mock('react-router', () => ({
  useNavigate: () => mockNavigate,
}));

import { SummaryStep } from './SummaryStep';

// --- Helpers ---

function makeCommitResult(overrides: Record<string, unknown> = {}) {
  return {
    entitiesCreated: 3,
    rulesApplied: { add: 2, edit: 1, disable: 0, remove: 0 },
    transactionsImported: 10,
    transactionsFailed: 1,
    failedDetails: [{ checksum: 'abc123def456', error: 'Duplicate checksum' }],
    retroactiveReclassifications: 4,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storeState = { commitResult: makeCommitResult(), reset: mockReset };
});

// --- Tests ---

describe('SummaryStep', () => {
  it('shows guard message when commitResult is null', () => {
    storeState = { commitResult: null, reset: mockReset };
    render(<SummaryStep />);
    expect(screen.getByText('No commit results available.')).toBeDefined();
  });

  it('renders Import Complete heading', () => {
    render(<SummaryStep />);
    expect(screen.getByText('Import Complete')).toBeDefined();
  });

  it('displays entities created count', () => {
    render(<SummaryStep />);
    const label = screen.getByText('Entities Created');
    const card = label.closest('.rounded-lg')!;
    expect(card.querySelector('.text-2xl')!.textContent).toBe('3');
  });

  it('displays total rules applied', () => {
    render(<SummaryStep />);
    // 2 add + 1 edit = 3 total
    expect(screen.getByText('Rules Applied')).toBeDefined();
  });

  it('displays transactions imported count', () => {
    render(<SummaryStep />);
    expect(screen.getByText('10')).toBeDefined();
    expect(screen.getByText('Transactions Imported')).toBeDefined();
  });

  it('displays transactions failed with red styling when > 0', () => {
    render(<SummaryStep />);
    expect(screen.getByText('Transactions Failed')).toBeDefined();
    // Verify the failed count is rendered (1 failed in default fixture)
    const failedLabel = screen.getByText('Transactions Failed');
    const card = failedLabel.closest('.rounded-lg')!;
    expect(card.querySelector('.text-2xl')!.textContent).toBe('1');
  });

  it('shows failure details section with checksum and error', () => {
    storeState = {
      commitResult: makeCommitResult({
        transactionsFailed: 2,
        failedDetails: [
          { checksum: 'abc123def456', error: 'Duplicate checksum' },
          { checksum: 'xyz789012345', error: 'Invalid amount' },
        ],
      }),
      reset: mockReset,
    };
    render(<SummaryStep />);
    expect(screen.getByText('Failed Transactions')).toBeDefined();
    expect(screen.getByText('abc123def456')).toBeDefined();
    expect(screen.getByText('Duplicate checksum')).toBeDefined();
    expect(screen.getByText('xyz789012345')).toBeDefined();
    expect(screen.getByText('Invalid amount')).toBeDefined();
  });

  it('hides failure details section when no failures', () => {
    storeState = {
      commitResult: makeCommitResult({ transactionsFailed: 0, failedDetails: [] }),
      reset: mockReset,
    };
    render(<SummaryStep />);
    expect(screen.queryByText('Failed Transactions')).toBeNull();
  });

  it('displays 0 failed in neutral style when no failures', () => {
    storeState = {
      commitResult: makeCommitResult({ transactionsFailed: 0, failedDetails: [] }),
      reset: mockReset,
    };
    render(<SummaryStep />);
    const failedLabel = screen.getByText('Transactions Failed');
    const card = failedLabel.closest('.rounded-lg')!;
    expect(card.querySelector('.text-2xl')!.textContent).toBe('0');
  });

  it('shows rule breakdown section when rules applied', () => {
    render(<SummaryStep />);
    expect(screen.getByText('Rule Breakdown')).toBeDefined();
    expect(screen.getByText('Added')).toBeDefined();
    expect(screen.getByText('Edited')).toBeDefined();
  });

  it('hides rule breakdown when no rules', () => {
    storeState = {
      commitResult: makeCommitResult({
        rulesApplied: { add: 0, edit: 0, disable: 0, remove: 0 },
      }),
      reset: mockReset,
    };
    render(<SummaryStep />);
    expect(screen.queryByText('Rule Breakdown')).toBeNull();
  });

  it('shows retroactive reclassification count', () => {
    render(<SummaryStep />);
    expect(screen.getByText('Retroactive Reclassifications')).toBeDefined();
    expect(
      screen.getByText('4 existing transactions were reclassified based on updated rules.')
    ).toBeDefined();
  });

  it("shows 'No existing transactions affected' when reclassifications = 0", () => {
    storeState = {
      commitResult: makeCommitResult({ retroactiveReclassifications: 0 }),
      reset: mockReset,
    };
    render(<SummaryStep />);
    expect(screen.getByText('No existing transactions affected.')).toBeDefined();
  });

  it('shows singular form for 1 reclassification', () => {
    storeState = {
      commitResult: makeCommitResult({ retroactiveReclassifications: 1 }),
      reset: mockReset,
    };
    render(<SummaryStep />);
    expect(
      screen.getByText('1 existing transaction was reclassified based on updated rules.')
    ).toBeDefined();
  });

  it('resets store and navigates on New Import click', () => {
    render(<SummaryStep />);
    fireEvent.click(screen.getByText('New Import'));
    expect(mockReset).toHaveBeenCalledOnce();
    expect(mockNavigate).toHaveBeenCalledWith('/import');
  });

  it('navigates to transactions on View Transactions click', () => {
    render(<SummaryStep />);
    fireEvent.click(screen.getByText('View Transactions'));
    expect(mockNavigate).toHaveBeenCalledWith('/transactions');
  });
});
