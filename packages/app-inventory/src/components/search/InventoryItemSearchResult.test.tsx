import { _clearRegistry, getResultComponent, registerResultComponent } from '@pops/navigation';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { highlightMatch, InventoryItemSearchResult } from './InventoryItemSearchResult';

beforeEach(() => {
  _clearRegistry();
});

const baseItem = {
  itemName: 'MacBook Pro 16',
  location: 'Desk',
  room: 'Office',
  replacementValue: 4299,
  brand: 'Apple',
  _query: 'macbook',
  _matchType: 'prefix',
};

describe('InventoryItemSearchResult', () => {
  it('renders name, brand, and location', () => {
    render(<InventoryItemSearchResult data={baseItem as unknown as Record<string, unknown>} />);
    expect(screen.getByText(/MacBook/)).toBeInTheDocument();
    expect(screen.getByText('Apple')).toBeInTheDocument();
    expect(screen.getByText('Office · Desk')).toBeInTheDocument();
  });

  it('renders formatted replacement value', () => {
    render(<InventoryItemSearchResult data={baseItem as unknown as Record<string, unknown>} />);
    expect(screen.getByTestId('value')).toHaveTextContent('$4,299');
  });

  it('hides value when null', () => {
    const data = { ...baseItem, replacementValue: null };
    render(<InventoryItemSearchResult data={data as unknown as Record<string, unknown>} />);
    expect(screen.queryByTestId('value')).not.toBeInTheDocument();
  });

  it('hides brand when null', () => {
    const data = { ...baseItem, brand: null };
    render(<InventoryItemSearchResult data={data as unknown as Record<string, unknown>} />);
    expect(screen.queryByText('Apple')).not.toBeInTheDocument();
  });

  it('renders location only when room is null', () => {
    const data = { ...baseItem, room: null };
    render(<InventoryItemSearchResult data={data as unknown as Record<string, unknown>} />);
    expect(screen.getByText('Desk')).toBeInTheDocument();
  });

  it('renders room only when location is null', () => {
    const data = { ...baseItem, location: null };
    render(<InventoryItemSearchResult data={data as unknown as Record<string, unknown>} />);
    expect(screen.getByText('Office')).toBeInTheDocument();
  });

  it('hides location text when both room and location are null', () => {
    const data = { ...baseItem, room: null, location: null };
    render(<InventoryItemSearchResult data={data as unknown as Record<string, unknown>} />);
    expect(screen.queryByText('Office')).not.toBeInTheDocument();
    expect(screen.queryByText('Desk')).not.toBeInTheDocument();
  });

  it('hides separator between brand and location when location is empty', () => {
    const data = { ...baseItem, room: null, location: null };
    const { container } = render(
      <InventoryItemSearchResult data={data as unknown as Record<string, unknown>} />
    );
    const dots = container.querySelectorAll('span');
    const dotTexts = Array.from(dots).map((el) => el.textContent);
    expect(dotTexts).not.toContain('·');
  });

  describe('registration', () => {
    it('can be registered and retrieved for inventory-items domain', () => {
      registerResultComponent('inventory-items', InventoryItemSearchResult);
      const Component = getResultComponent('inventory-items');
      expect(Component).toBe(InventoryItemSearchResult);
    });
  });
});

describe('highlightMatch', () => {
  it('highlights exact match', () => {
    const { container } = render(
      <span>{highlightMatch('MacBook Pro', 'MacBook Pro', 'exact')}</span>
    );
    const mark = container.querySelector('mark');
    expect(mark).toHaveTextContent('MacBook Pro');
  });

  it('highlights prefix match', () => {
    const { container } = render(
      <span>{highlightMatch('MacBook Pro 16', 'MacBook', 'prefix')}</span>
    );
    const mark = container.querySelector('mark');
    expect(mark).toHaveTextContent('MacBook');
  });

  it('highlights contains match', () => {
    const { container } = render(
      <span>{highlightMatch('Sony WH-1000XM5', '1000', 'contains')}</span>
    );
    const mark = container.querySelector('mark');
    expect(mark).toHaveTextContent('1000');
  });

  it('returns plain text when query is empty', () => {
    const { container } = render(<span>{highlightMatch('MacBook Pro', '', 'exact')}</span>);
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('MacBook Pro');
  });

  it('returns plain text when no match found', () => {
    const { container } = render(<span>{highlightMatch('MacBook Pro', 'XYZ', 'contains')}</span>);
    expect(container.querySelector('mark')).toBeNull();
    expect(container.textContent).toBe('MacBook Pro');
  });
});
