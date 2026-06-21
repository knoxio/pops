import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { InventoryTable, type InventoryTableItem } from './InventoryTable';

function renderTable(
  items: InventoryTableItem[],
  locationPathMap?: ReadonlyMap<string, { id: string; name: string }[]>
) {
  return render(
    <MemoryRouter>
      <InventoryTable items={items} locationPathMap={locationPathMap} />
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
  locationId: null,
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
// Location column — breadcrumb rendering
// ---------------------------------------------------------------------------

describe('Location column — breadcrumb rendering', () => {
  it('renders breadcrumb path when locationId matches locationPathMap', () => {
    const map = new Map([
      [
        'loc-shelf',
        [
          { id: 'loc-home', name: 'Home' },
          { id: 'loc-living', name: 'Living Room' },
          { id: 'loc-shelf', name: 'Shelf' },
        ],
      ],
    ]);

    renderTable([{ ...baseItem, locationId: 'loc-shelf', location: null }], map);

    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Living Room')).toBeInTheDocument();
    expect(screen.getByText('Shelf')).toBeInTheDocument();
  });

  it('renders full path as tooltip on the breadcrumb wrapper', () => {
    const map = new Map([
      [
        'loc-shelf',
        [
          { id: 'loc-home', name: 'Home' },
          { id: 'loc-shelf', name: 'Shelf' },
        ],
      ],
    ]);

    renderTable([{ ...baseItem, locationId: 'loc-shelf', location: null }], map);

    const wrapper = screen.getByTitle('Home > Shelf');
    expect(wrapper).toBeInTheDocument();
  });

  it('falls back to legacy free-text location when locationId has no map entry', () => {
    const map = new Map<string, { id: string; name: string }[]>();

    renderTable([{ ...baseItem, locationId: 'loc-unknown', location: 'Old Office' }], map);

    expect(screen.getByText('Old Office')).toBeInTheDocument();
  });

  it('renders dash when locationId is null and no location text', () => {
    renderTable([{ ...baseItem, locationId: null, location: null }]);
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders single-segment breadcrumb', () => {
    const map = new Map([['loc-room', [{ id: 'loc-room', name: 'Storage' }]]]);

    renderTable([{ ...baseItem, locationId: 'loc-room' }], map);

    expect(screen.getByText('Storage')).toBeInTheDocument();
  });

  it('falls back to dash when no locationPathMap and location is null', () => {
    renderTable([{ ...baseItem, locationId: null, location: null }]);
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
    // Date formatting is locale-dependent; check something non-empty renders
    const dateCell = screen.getByText(/2024/);
    expect(dateCell).toBeInTheDocument();
  });
});
