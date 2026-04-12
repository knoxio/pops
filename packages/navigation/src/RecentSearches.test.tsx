import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RecentSearches } from './RecentSearches';

describe('RecentSearches', () => {
  it('renders nothing when queries is empty', () => {
    const { container } = render(
      <RecentSearches queries={[]} onSelect={vi.fn()} onClear={vi.fn()} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders recent queries', () => {
    render(
      <RecentSearches queries={['matrix', 'inception']} onSelect={vi.fn()} onClear={vi.fn()} />
    );
    expect(screen.getByText('matrix')).toBeInTheDocument();
    expect(screen.getByText('inception')).toBeInTheDocument();
    expect(screen.getByText('Recent searches')).toBeInTheDocument();
  });

  it('calls onSelect when a query is clicked', () => {
    const onSelect = vi.fn();
    render(<RecentSearches queries={['matrix']} onSelect={onSelect} onClear={vi.fn()} />);
    fireEvent.click(screen.getByTestId('recent-query-matrix'));
    expect(onSelect).toHaveBeenCalledWith('matrix');
  });

  it('calls onClear when clear button is clicked', () => {
    const onClear = vi.fn();
    render(<RecentSearches queries={['matrix']} onSelect={vi.fn()} onClear={onClear} />);
    fireEvent.click(screen.getByTestId('clear-recent'));
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('renders clear recent button', () => {
    render(<RecentSearches queries={['matrix']} onSelect={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getByText('Clear recent')).toBeInTheDocument();
  });
});
