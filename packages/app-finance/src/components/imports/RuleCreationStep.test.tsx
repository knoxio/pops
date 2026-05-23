import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockNextStep = vi.fn();
const mockAddPendingTagRuleChangeSet = vi.fn();

let storeState: Record<string, unknown> = {
  confirmedTransactions: [],
  nextStep: mockNextStep,
  addPendingTagRuleChangeSet: mockAddPendingTagRuleChangeSet,
};

vi.mock('../../store/importStore', () => ({
  useImportStore: (selector?: (s: Record<string, unknown>) => unknown) =>
    selector ? selector(storeState) : storeState,
}));

import { RuleCreationStep } from './RuleCreationStep';

function makeTxn(overrides: Record<string, unknown> = {}) {
  return {
    description: 'WOOLWORTHS 1034 SYDNEY',
    date: '2026-01-01',
    amount: -25.5,
    account: 'Amex',
    rawRow: '{}',
    checksum: 'abc',
    entityId: 'entity-woolworths',
    entityName: 'Woolworths',
    tags: ['Groceries'],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  storeState = {
    confirmedTransactions: [],
    nextStep: mockNextStep,
    addPendingTagRuleChangeSet: mockAddPendingTagRuleChangeSet,
  };
});

describe('RuleCreationStep', () => {
  it('shows empty state when no tagged transactions', () => {
    render(<RuleCreationStep />);
    expect(screen.getByText(/No tag patterns detected/i)).toBeInTheDocument();
  });

  it('shows Skip button in empty state', () => {
    render(<RuleCreationStep />);
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(mockNextStep).toHaveBeenCalledOnce();
  });

  it('shows a proposal card for an entity with consistent tags', () => {
    storeState.confirmedTransactions = [makeTxn(), makeTxn({ checksum: 'abc2' })];
    render(<RuleCreationStep />);
    expect(screen.getByText('Woolworths')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText(/2 transactions/i)).toBeInTheDocument();
  });

  it('proposals are checked by default', () => {
    storeState.confirmedTransactions = [makeTxn()];
    render(<RuleCreationStep />);
    const checkbox = screen.getByRole('checkbox');
    expect(checkbox).toBeChecked();
  });

  it('creates rules for checked proposals on confirm', () => {
    storeState.confirmedTransactions = [makeTxn()];
    render(<RuleCreationStep />);
    fireEvent.click(screen.getByRole('button', { name: /Create.*rule/i }));
    expect(mockAddPendingTagRuleChangeSet).toHaveBeenCalledOnce();
    expect(mockNextStep).toHaveBeenCalledOnce();
    const call = mockAddPendingTagRuleChangeSet.mock.calls[0]![0];
    expect(call.changeSet.ops[0].op).toBe('add');
    expect(call.changeSet.ops[0].data.descriptionPattern).toBe('woolworths');
    expect(call.changeSet.ops[0].data.tags).toEqual(['Groceries']);
  });

  it('unchecking a proposal excludes it from rule creation', () => {
    storeState.confirmedTransactions = [
      makeTxn({ entityId: 'e1', entityName: 'Woolworths' }),
      makeTxn({ entityId: 'e2', entityName: 'Ampol', tags: ['Charging', 'EV'], checksum: 'x2' }),
    ];
    render(<RuleCreationStep />);
    const checkboxes = screen.getAllByRole('checkbox');
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(screen.getByRole('button', { name: /Create.*rule/i }));
    expect(mockAddPendingTagRuleChangeSet).toHaveBeenCalledOnce();
    const call = mockAddPendingTagRuleChangeSet.mock.calls[0]![0];
    expect(call.changeSet.ops[0].data.descriptionPattern).toBe('ampol');
  });

  it('skip advances without creating rules', () => {
    storeState.confirmedTransactions = [makeTxn()];
    render(<RuleCreationStep />);
    fireEvent.click(screen.getByRole('button', { name: /skip/i }));
    expect(mockAddPendingTagRuleChangeSet).not.toHaveBeenCalled();
    expect(mockNextStep).toHaveBeenCalledOnce();
  });

  it('excludes transactions with no tags from proposals', () => {
    storeState.confirmedTransactions = [makeTxn({ tags: [] }), makeTxn({ tags: undefined })];
    render(<RuleCreationStep />);
    expect(screen.getByText(/No tag patterns detected/i)).toBeInTheDocument();
  });

  it('only includes tags appearing on ≥50% of transactions in a group', () => {
    storeState.confirmedTransactions = [
      makeTxn({ tags: ['Groceries', 'Organic'] }),
      makeTxn({ tags: ['Groceries'], checksum: 'x2' }),
      makeTxn({ tags: ['Groceries'], checksum: 'x3' }),
    ];
    render(<RuleCreationStep />);
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.queryByText('Organic')).not.toBeInTheDocument();
  });
});
