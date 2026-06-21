import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TransactionsResultComponent } from './TransactionsResultComponent';

function makeData(overrides: Record<string, unknown> = {}) {
  return {
    description: 'WOOLWORTHS 1234',
    amount: 42.5,
    date: '2026-03-15',
    entityName: 'Woolworths',
    type: 'expense',
    ...overrides,
  };
}

describe('TransactionsResultComponent', () => {
  it('renders description and entity name', () => {
    render(<TransactionsResultComponent data={makeData()} />);
    expect(screen.getByText('WOOLWORTHS 1234')).toBeInTheDocument();
    expect(screen.getByText('Woolworths')).toBeInTheDocument();
  });

  it('renders expense amount in red with minus sign', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'expense', amount: 99.0 })} />);
    const amount = screen.getByText('-$99.00');
    expect(amount).toBeInTheDocument();
    expect(amount.className).toContain('text-destructive');
  });

  it('renders income amount in green with plus sign', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'income', amount: 3500 })} />);
    const amount = screen.getByText('+$3,500.00');
    expect(amount).toBeInTheDocument();
    expect(amount.className).toContain('text-success');
  });

  it('renders transfer amount in muted color with no sign', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'transfer', amount: 200 })} />);
    const amount = screen.getByText('$200.00');
    expect(amount).toBeInTheDocument();
    expect(amount.className).toContain('text-muted-foreground');
  });

  it('renders formatted date', () => {
    render(<TransactionsResultComponent data={makeData({ date: '2026-03-15' })} />);
    expect(screen.getByText(/15 Mar 2026/)).toBeInTheDocument();
  });

  it('hides entity name when null', () => {
    render(<TransactionsResultComponent data={makeData({ entityName: null })} />);
    expect(screen.getByText('WOOLWORTHS 1234')).toBeInTheDocument();
    expect(screen.queryByText('Woolworths')).not.toBeInTheDocument();
  });

  it('shows type badge for expense', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'expense' })} />);
    expect(screen.getByText('expense')).toBeInTheDocument();
  });

  it('shows type badge for income', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'income' })} />);
    expect(screen.getByText('income')).toBeInTheDocument();
  });

  it('shows type badge for transfer', () => {
    render(<TransactionsResultComponent data={makeData({ type: 'transfer' })} />);
    expect(screen.getByText('transfer')).toBeInTheDocument();
  });

  it('highlights matched portion of description', () => {
    const { container } = render(
      <TransactionsResultComponent
        data={makeData({ description: 'WOOLWORTHS 1234' })}
        query="WOOL"
        matchField="description"
      />
    );
    const mark = container.querySelector('mark');
    expect(mark).toBeInTheDocument();
    expect(mark!.textContent).toBe('WOOL');
  });

  it('does not highlight when matchField is not description', () => {
    const { container } = render(
      <TransactionsResultComponent
        data={makeData({ description: 'WOOLWORTHS 1234' })}
        query="WOOL"
        matchField="entityName"
      />
    );
    expect(container.querySelector('mark')).not.toBeInTheDocument();
  });

  it('does not highlight when query is empty', () => {
    const { container } = render(
      <TransactionsResultComponent
        data={makeData({ description: 'WOOLWORTHS 1234' })}
        query=""
        matchField="description"
      />
    );
    expect(container.querySelector('mark')).not.toBeInTheDocument();
  });
});
