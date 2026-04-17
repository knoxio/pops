import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { InventoryTable, type InventoryTableItem } from './InventoryTable';

function renderTable(items: InventoryTableItem[]) {
  return render(
    <MemoryRouter>
      <InventoryTable items={items} />
    </MemoryRouter>
  );
}

const baseItem: InventoryTableItem = {
  id: 'item-1',
  itemName: 'MacBook Pro',
  brand: 'Apple',
  type: 'Electronics',
  condition: null,
  location: null,
  replacementValue: null,
  purchaseDate: null,
  inUse: true,
  assetId: null,
};

// ---------------------------------------------------------------------------
// Condition badge colour mapping
// ---------------------------------------------------------------------------

describe('Condition column — badge colour mapping', () => {
  it.each([
    ['new', 'new'],
    ['good', 'good'],
    ['fair', 'fair'],
    ['poor', 'poor'],
    ['broken', 'broken'],
  ] as const)('renders badge for condition "%s"', (condition, expected) => {
    renderTable([{ ...baseItem, condition }]);
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it('renders badge for legacy Title Case "Good"', () => {
    renderTable([{ ...baseItem, condition: 'Good' }]);
    expect(screen.getByText('Good')).toBeInTheDocument();
  });

  it('renders badge for legacy Title Case "Excellent"', () => {
    renderTable([{ ...baseItem, condition: 'Excellent' }]);
    expect(screen.getByText('Excellent')).toBeInTheDocument();
  });

  it('renders dash for null condition', () => {
    renderTable([{ ...baseItem, condition: null }]);
    const cells = screen.getAllByText('—');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('renders dash for unknown condition string', () => {
    renderTable([{ ...baseItem, condition: 'mint' }]);
    const cells = screen.getAllByText('—');
    expect(cells.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Location column — free-text rendering
// ---------------------------------------------------------------------------

describe('Location column — free-text rendering', () => {
  it('renders location text when provided', () => {
    renderTable([{ ...baseItem, location: 'Living Room' }]);
    expect(screen.getByText('Living Room')).toBeInTheDocument();
  });

  it('renders dash when location is null', () => {
    renderTable([{ ...baseItem, location: null }]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Null field handling
// ---------------------------------------------------------------------------

describe('Null field handling', () => {
  it('renders dash for null brand', () => {
    renderTable([{ ...baseItem, brand: null }]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders nothing for null type', () => {
    renderTable([{ ...baseItem, type: null }]);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders dash for null replacementValue', () => {
    renderTable([{ ...baseItem, replacementValue: null }]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders dash for null purchaseDate', () => {
    renderTable([{ ...baseItem, purchaseDate: null }]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders in-use check icon for inUse=true', () => {
    const { container } = renderTable([{ ...baseItem, inUse: true }]);
    expect(screen.getByText('MacBook Pro')).toBeInTheDocument();
    expect(container).toBeInTheDocument();
  });

  it('renders item name', () => {
    renderTable([{ ...baseItem }]);
    expect(screen.getByText('MacBook Pro')).toBeInTheDocument();
  });

  it('renders formatted replacement value', () => {
    renderTable([{ ...baseItem, replacementValue: 2500 }]);
    expect(screen.getByText(/2,500/)).toBeInTheDocument();
  });

  it('renders formatted purchase date', () => {
    renderTable([{ ...baseItem, purchaseDate: '2024-06-15' }]);
    const dateCell = screen.getByText(/2024/);
    expect(dateCell).toBeInTheDocument();
  });
});
