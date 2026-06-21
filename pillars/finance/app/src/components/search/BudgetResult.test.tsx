import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { _clearRegistry, getResultComponent, registerResultComponent } from '@pops/navigation';

import { BudgetResult } from './BudgetResult';

beforeEach(() => {
  _clearRegistry();
});

describe('BudgetResult', () => {
  it('registers for the budgets domain', () => {
    registerResultComponent('budgets', BudgetResult);
    const Component = getResultComponent('budgets');
    expect(Component).toBe(BudgetResult);
  });

  it('renders category, period, and formatted amount', () => {
    render(
      <BudgetResult
        data={{
          category: 'Groceries',
          period: 'monthly',
          amount: 500,
        }}
      />
    );

    expect(screen.getByText('Groceries')).toBeInTheDocument();
    expect(screen.getByText('Monthly')).toBeInTheDocument();
    expect(screen.getByText('$500.00')).toBeInTheDocument();
  });

  it('renders yearly period', () => {
    render(
      <BudgetResult
        data={{
          category: 'Insurance',
          period: 'yearly',
          amount: 2400,
        }}
      />
    );

    expect(screen.getByText('Yearly')).toBeInTheDocument();
    expect(screen.getByText('$2,400.00')).toBeInTheDocument();
  });

  it('renders dash for null amount', () => {
    render(
      <BudgetResult
        data={{
          category: 'Misc',
          period: null,
          amount: null,
        }}
      />
    );

    expect(screen.getByText('Misc')).toBeInTheDocument();
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  it('hides period when null', () => {
    render(
      <BudgetResult
        data={{
          category: 'Misc',
          period: null,
          amount: 100,
        }}
      />
    );

    expect(screen.queryByText('Monthly')).not.toBeInTheDocument();
    expect(screen.queryByText('Yearly')).not.toBeInTheDocument();
    expect(screen.getByText('$100.00')).toBeInTheDocument();
  });

  it('renders date-like period as-is', () => {
    render(
      <BudgetResult
        data={{
          category: 'Savings',
          period: '2025-06',
          amount: 1000,
        }}
      />
    );

    expect(screen.getByText('2025-06')).toBeInTheDocument();
  });

  it('highlights matched category for exact match', () => {
    const { container } = render(
      <BudgetResult
        data={{ category: 'Groceries', period: 'monthly', amount: 500 }}
        query="Groceries"
        matchField="category"
        matchType="exact"
      />
    );

    const mark = container.querySelector('mark');
    expect(mark).toBeInTheDocument();
    expect(mark!.textContent).toBe('Groceries');
  });

  it('highlights matched category for prefix match', () => {
    const { container } = render(
      <BudgetResult
        data={{ category: 'Entertainment', period: 'monthly', amount: 200 }}
        query="Enter"
        matchField="category"
        matchType="prefix"
      />
    );

    const mark = container.querySelector('mark');
    expect(mark).toBeInTheDocument();
    expect(mark!.textContent).toBe('Enter');
  });

  it('highlights matched category for contains match', () => {
    const { container } = render(
      <BudgetResult
        data={{ category: 'Entertainment', period: 'monthly', amount: 200 }}
        query="tain"
        matchField="category"
        matchType="contains"
      />
    );

    const mark = container.querySelector('mark');
    expect(mark).toBeInTheDocument();
    expect(mark!.textContent).toBe('tain');
  });

  it('does not highlight when matchField is not category', () => {
    const { container } = render(
      <BudgetResult
        data={{ category: 'Groceries', period: 'monthly', amount: 500 }}
        query="Groceries"
        matchField="notes"
        matchType="exact"
      />
    );

    expect(container.querySelector('mark')).not.toBeInTheDocument();
  });

  it('does not highlight when no query provided', () => {
    const { container } = render(
      <BudgetResult
        data={{
          category: 'Groceries',
          period: 'monthly',
          amount: 500,
        }}
      />
    );

    expect(container.querySelector('mark')).not.toBeInTheDocument();
  });
});
