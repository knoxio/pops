import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { _clearRegistry, getResultComponent, registerResultComponent } from '@pops/navigation';

import { WishlistResult } from './WishlistResult';

beforeEach(() => {
  _clearRegistry();
});

describe('WishlistResult', () => {
  it('registers for the wishlist domain', () => {
    registerResultComponent('wishlist', WishlistResult);
    const Component = getResultComponent('wishlist');
    expect(Component).toBe(WishlistResult);
  });

  it('renders item name, priority, and formatted target amount', () => {
    render(
      <WishlistResult
        data={{
          item: 'Japan Trip',
          priority: 'high',
          targetAmount: 5000,
        }}
      />
    );

    expect(screen.getByText('Japan Trip')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
    expect(screen.getByText('$5,000.00')).toBeInTheDocument();
  });

  it('does not render trailing amount when targetAmount is null', () => {
    render(
      <WishlistResult
        data={{
          item: 'Standing Desk',
          priority: null,
          targetAmount: null,
        }}
      />
    );

    expect(screen.getByText('Standing Desk')).toBeInTheDocument();
    expect(screen.queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('hides priority when null', () => {
    render(
      <WishlistResult
        data={{
          item: 'Gaming PC',
          priority: null,
          targetAmount: 2000,
        }}
      />
    );

    expect(screen.queryByText('High')).not.toBeInTheDocument();
    expect(screen.queryByText('Medium')).not.toBeInTheDocument();
    expect(screen.queryByText('Low')).not.toBeInTheDocument();
    expect(screen.getByText('$2,000.00')).toBeInTheDocument();
  });

  it('capitalises priority', () => {
    render(
      <WishlistResult
        data={{
          item: 'New Camera',
          priority: 'medium',
          targetAmount: null,
        }}
      />
    );

    expect(screen.getByText('Medium')).toBeInTheDocument();
  });

  it('highlights matched item name for exact match', () => {
    const { container } = render(
      <WishlistResult
        data={{
          item: 'Japan Trip',
          priority: null,
          targetAmount: null,
          _query: 'Japan Trip',
          _matchField: 'item',
          _matchType: 'exact',
        }}
      />
    );

    const mark = container.querySelector('mark');
    expect(mark).toBeInTheDocument();
    expect(mark!.textContent).toBe('Japan Trip');
  });

  it('highlights matched item name for prefix match', () => {
    const { container } = render(
      <WishlistResult
        data={{
          item: 'Gaming PC',
          priority: null,
          targetAmount: null,
          _query: 'Gaming',
          _matchField: 'item',
          _matchType: 'prefix',
        }}
      />
    );

    const mark = container.querySelector('mark');
    expect(mark).toBeInTheDocument();
    expect(mark!.textContent).toBe('Gaming');
  });

  it('highlights matched item name for contains match', () => {
    const { container } = render(
      <WishlistResult
        data={{
          item: 'Standing Desk',
          priority: null,
          targetAmount: null,
          _query: 'anding',
          _matchField: 'item',
          _matchType: 'contains',
        }}
      />
    );

    const mark = container.querySelector('mark');
    expect(mark).toBeInTheDocument();
    expect(mark!.textContent).toBe('anding');
  });

  it('does not highlight when matchField is not item', () => {
    const { container } = render(
      <WishlistResult
        data={{
          item: 'Japan Trip',
          priority: null,
          targetAmount: null,
          _query: 'Japan',
          _matchField: 'notes',
          _matchType: 'exact',
        }}
      />
    );

    expect(container.querySelector('mark')).not.toBeInTheDocument();
  });

  it('does not highlight when no query provided', () => {
    const { container } = render(
      <WishlistResult
        data={{
          item: 'Japan Trip',
          priority: null,
          targetAmount: null,
        }}
      />
    );

    expect(container.querySelector('mark')).not.toBeInTheDocument();
  });
});
