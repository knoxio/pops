import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useMemo, type ReactElement } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  PaperlessStatusResponses,
  ReportsWarrantiesResponses,
} from '../inventory-api/types.gen';

const { reportsWarrantiesMock, paperlessStatusMock } = vi.hoisted(() => ({
  reportsWarrantiesMock: vi.fn(),
  paperlessStatusMock: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  reportsWarranties: (...args: unknown[]) => reportsWarrantiesMock(...args),
  paperlessStatus: (...args: unknown[]) => paperlessStatusMock(...args),
}));

import { WarrantiesPage } from './WarrantiesPage';

type WarrantiesPayload = NonNullable<ReportsWarrantiesResponses[200]>;
type WarrantyApiItem = WarrantiesPayload['data'][number];
type PaperlessPayload = NonNullable<PaperlessStatusResponses[200]>;

function makeItem(overrides: Partial<WarrantyApiItem> = {}): WarrantyApiItem {
  return {
    id: 'item-1',
    itemId: 'item-1',
    itemName: 'Test Item',
    warrantyExpires: null,
    assetId: null,
    brand: null,
    model: null,
    replacementValue: null,
    warrantyDocumentId: null,
    condition: null,
    deductible: false,
    inUse: false,
    lastEditedTime: '2026-01-01T00:00:00Z',
    location: null,
    locationId: null,
    notes: null,
    purchaseDate: null,
    purchasePrice: null,
    purchaseTransactionId: null,
    purchasedFromId: null,
    purchasedFromName: null,
    resaleValue: null,
    room: null,
    type: null,
    ...overrides,
  };
}

/** Return a YYYY-MM-DD string N local calendar days from today. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function mockWarranties(items: WarrantyApiItem[]): void {
  reportsWarrantiesMock.mockImplementation(async () => ({
    data: { data: items } satisfies WarrantiesPayload,
    error: undefined,
  }));
}

function mockWarrantiesUnavailable(message = 'unavailable'): void {
  reportsWarrantiesMock.mockImplementation(async () => ({
    data: undefined,
    error: { message },
    response: { status: 500 },
  }));
}

function mockWarrantiesPending(): void {
  reportsWarrantiesMock.mockImplementation(
    () => new Promise(() => undefined) as Promise<{ data: WarrantiesPayload; error: undefined }>
  );
}

function mockPaperless(status: PaperlessPayload['data']): void {
  paperlessStatusMock.mockImplementation(async () => ({
    data: { data: status } satisfies PaperlessPayload,
    error: undefined,
  }));
}

function Wrapper({ children }: { children: ReactElement }): ReactElement {
  const qc = useMemo(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false },
          mutations: { retry: false },
        },
      }),
    []
  );
  return (
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/inventory/warranties']}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
}

function renderPage(): void {
  render(
    <Wrapper>
      <WarrantiesPage />
    </Wrapper>
  );
}

beforeEach(() => {
  reportsWarrantiesMock.mockReset();
  paperlessStatusMock.mockReset();
  mockWarranties([]);
  mockPaperless({ configured: false, available: false, baseUrl: null });
});

describe('WarrantiesPage', () => {
  it('shows loading skeleton', () => {
    mockWarrantiesPending();
    renderPage();
    expect(screen.queryByText('No items with warranty dates')).not.toBeInTheDocument();
    expect(screen.queryByText('Browse Items')).not.toBeInTheDocument();
  });

  it('shows empty state with Browse Items link', async () => {
    renderPage();
    expect(await screen.findByText(/No items with warranty dates/)).toBeInTheDocument();
    const link = screen.getByText('Browse Items');
    expect(link).toBeInTheDocument();
    expect(link.closest('a')).toHaveAttribute('href', '/inventory/items');
  });

  it('shows error state with retry button', async () => {
    mockWarrantiesUnavailable();
    renderPage();
    expect(await screen.findByText(/Could not load warranties/)).toBeInTheDocument();
    const callsBefore = reportsWarrantiesMock.mock.calls.length;
    fireEvent.click(screen.getByText('Retry'));
    await waitFor(() =>
      expect(reportsWarrantiesMock.mock.calls.length).toBeGreaterThan(callsBefore)
    );
  });

  describe('5-tier grouping', () => {
    it('shows critical tier for items under 30 days', async () => {
      mockWarranties([makeItem({ id: '1', itemName: 'Laptop', warrantyExpires: daysFromNow(10) })]);
      renderPage();
      expect(await screen.findByText('Critical — Under 30 Days')).toBeInTheDocument();
      expect(screen.getByText('Laptop')).toBeInTheDocument();
    });

    it('shows warning tier for items 30-60 days', async () => {
      mockWarranties([makeItem({ id: '1', itemName: 'Tablet', warrantyExpires: daysFromNow(45) })]);
      renderPage();
      expect(await screen.findByText('Warning — 30 to 60 Days')).toBeInTheDocument();
      expect(screen.getByText('Tablet')).toBeInTheDocument();
    });

    it('shows caution tier for items 60-90 days', async () => {
      mockWarranties([
        makeItem({ id: '1', itemName: 'Monitor', warrantyExpires: daysFromNow(75) }),
      ]);
      renderPage();
      expect(await screen.findByText('Caution — 60 to 90 Days')).toBeInTheDocument();
      expect(screen.getByText('Monitor')).toBeInTheDocument();
    });

    it('shows active tier for items over 90 days', async () => {
      mockWarranties([makeItem({ id: '1', itemName: 'Phone', warrantyExpires: daysFromNow(200) })]);
      renderPage();
      expect(await screen.findByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Phone')).toBeInTheDocument();
    });

    it('shows expired tier for past-date items', async () => {
      mockWarranties([
        makeItem({ id: '1', itemName: 'Old Laptop', warrantyExpires: '2020-01-01' }),
      ]);
      renderPage();
      expect(await screen.findByText('Expired')).toBeInTheDocument();
      // Expired section auto-expands when it's the only tier
      expect(screen.getByText('Old Laptop')).toBeInTheDocument();
    });

    it('groups items across all 5 tiers simultaneously', async () => {
      mockWarranties([
        makeItem({ id: '1', itemName: 'Critical Item', warrantyExpires: daysFromNow(5) }),
        makeItem({ id: '2', itemName: 'Warning Item', warrantyExpires: daysFromNow(40) }),
        makeItem({ id: '3', itemName: 'Caution Item', warrantyExpires: daysFromNow(70) }),
        makeItem({ id: '4', itemName: 'Active Item', warrantyExpires: daysFromNow(180) }),
        makeItem({ id: '5', itemName: 'Expired Item', warrantyExpires: '2020-01-01' }),
      ]);
      renderPage();
      expect(await screen.findByText('Critical — Under 30 Days')).toBeInTheDocument();
      expect(screen.getByText('Warning — 30 to 60 Days')).toBeInTheDocument();
      expect(screen.getByText('Caution — 60 to 90 Days')).toBeInTheDocument();
      expect(screen.getByText('Active')).toBeInTheDocument();
      expect(screen.getByText('Expired')).toBeInTheDocument();
      // Expiring tiers always visible (not collapsible)
      expect(screen.getByText('Critical Item')).toBeInTheDocument();
      expect(screen.getByText('Warning Item')).toBeInTheDocument();
      expect(screen.getByText('Caution Item')).toBeInTheDocument();
      // Active expanded by default
      expect(screen.getByText('Active Item')).toBeInTheDocument();
      // Expired collapsed when other items exist
      expect(screen.queryByText('Expired Item')).not.toBeInTheDocument();
    });
  });

  describe('collapsible behavior', () => {
    it('expands Expired section when all warranties are expired', async () => {
      mockWarranties([
        makeItem({ id: '1', itemName: 'Old Laptop', warrantyExpires: '2020-01-01' }),
        makeItem({ id: '2', itemName: 'Old Phone', warrantyExpires: '2019-06-15' }),
      ]);
      renderPage();
      expect(await screen.findByText('Old Laptop')).toBeInTheDocument();
      expect(screen.getByText('Old Phone')).toBeInTheDocument();
    });

    it('collapses Expired section when active items exist', async () => {
      mockWarranties([
        makeItem({ id: '1', itemName: 'New Laptop', warrantyExpires: daysFromNow(200) }),
        makeItem({ id: '2', itemName: 'Old Phone', warrantyExpires: '2020-01-01' }),
      ]);
      renderPage();
      expect(await screen.findByText('New Laptop')).toBeInTheDocument();
      expect(screen.queryByText('Old Phone')).not.toBeInTheDocument();
    });

    it('shows Expired items after expanding collapsed section', async () => {
      mockWarranties([
        makeItem({ id: '1', itemName: 'New Laptop', warrantyExpires: daysFromNow(200) }),
        makeItem({ id: '2', itemName: 'Old Phone', warrantyExpires: '2020-01-01' }),
      ]);
      renderPage();
      fireEvent.click(await screen.findByText('Expired'));
      expect(screen.getByText('Old Phone')).toBeInTheDocument();
    });

    it('collapses Expired when expiring items exist (not just active)', async () => {
      mockWarranties([
        makeItem({ id: '1', itemName: 'Expiring Item', warrantyExpires: daysFromNow(15) }),
        makeItem({ id: '2', itemName: 'Expired Item', warrantyExpires: '2020-01-01' }),
      ]);
      renderPage();
      expect(await screen.findByText('Expiring Item')).toBeInTheDocument();
      expect(screen.queryByText('Expired Item')).not.toBeInTheDocument();
    });
  });

  describe('empty tiers are hidden', () => {
    it('does not render tier headers for empty tiers', async () => {
      mockWarranties([
        makeItem({ id: '1', itemName: 'Active Only', warrantyExpires: daysFromNow(200) }),
      ]);
      renderPage();
      expect(await screen.findByText('Active')).toBeInTheDocument();
      expect(screen.queryByText('Critical — Under 30 Days')).not.toBeInTheDocument();
      expect(screen.queryByText('Warning — 30 to 60 Days')).not.toBeInTheDocument();
      expect(screen.queryByText('Caution — 60 to 90 Days')).not.toBeInTheDocument();
      expect(screen.queryByText('Expired')).not.toBeInTheDocument();
    });
  });

  it('shows brand and model in warranty row', async () => {
    mockWarranties([
      makeItem({
        id: '1',
        itemName: 'Laptop',
        brand: 'Apple',
        model: 'MacBook Pro',
        warrantyExpires: '2030-01-01',
      }),
    ]);
    renderPage();
    expect(await screen.findByText('Laptop')).toBeInTheDocument();
    expect(screen.getByText('Apple MacBook Pro')).toBeInTheDocument();
  });

  it('shows brand only when model is null', async () => {
    mockWarranties([
      makeItem({
        id: '1',
        itemName: 'TV',
        brand: 'Samsung',
        model: null,
        warrantyExpires: '2030-01-01',
      }),
    ]);
    renderPage();
    expect(await screen.findByText('Samsung')).toBeInTheDocument();
  });

  it('shows days-remaining badge for active warranties', async () => {
    mockWarranties([makeItem({ id: '1', itemName: 'Active Item', warrantyExpires: '2030-06-01' })]);
    renderPage();
    // Active items (>90 days) should show a days-remaining badge
    expect(await screen.findByText('Active Item')).toBeInTheDocument();
    expect(screen.getByText(/days$/)).toBeInTheDocument();
  });

  it('shows urgency badge for expiring soon items', async () => {
    const soonStr = daysFromNow(10);
    mockWarranties([makeItem({ id: '1', itemName: 'Urgent Item', warrantyExpires: soonStr })]);
    renderPage();
    expect(await screen.findByText('Urgent Item')).toBeInTheDocument();
    // Item is in the Critical tier (< 30 days) with a days-remaining badge
    expect(screen.getByText('Critical — Under 30 Days')).toBeInTheDocument();
    expect(screen.getByText('10 days')).toBeInTheDocument();
  });

  it('shows expired time ago text', async () => {
    mockWarranties([makeItem({ id: '1', itemName: 'Old Item', warrantyExpires: '2020-01-01' })]);
    renderPage();
    // Only expired items → section defaults open
    expect(await screen.findByText('Old Item')).toBeInTheDocument();
    expect(screen.getByText(/d ago$/)).toBeInTheDocument();
  });

  it('sorts expiring soon section by soonest first', async () => {
    const soon1 = new Date();
    soon1.setDate(soon1.getDate() + 5);
    const soon2 = new Date();
    soon2.setDate(soon2.getDate() + 30);

    mockWarranties([
      makeItem({
        id: '2',
        itemName: 'Later Expiry',
        warrantyExpires: soon2.toISOString().slice(0, 10),
      }),
      makeItem({
        id: '1',
        itemName: 'Sooner Expiry',
        warrantyExpires: soon1.toISOString().slice(0, 10),
      }),
    ]);
    renderPage();
    await screen.findByText('Sooner Expiry');
    const buttons = screen.getAllByRole('button').filter((b) => b.textContent?.includes('Expiry'));
    expect(buttons[0]!.textContent).toContain('Sooner Expiry');
    expect(buttons[1]!.textContent).toContain('Later Expiry');
  });

  it('shows asset ID badge when present', async () => {
    mockWarranties([
      makeItem({
        id: '1',
        itemName: 'Tagged Item',
        assetId: 'INV-001',
        warrantyExpires: '2030-01-01',
      }),
    ]);
    renderPage();
    expect(await screen.findByText('INV-001')).toBeInTheDocument();
  });

  describe('warranty document link', () => {
    it('shows View Warranty link when document and Paperless configured', async () => {
      mockWarranties([
        makeItem({
          id: '1',
          itemName: 'MacBook',
          warrantyExpires: '2030-01-01',
          warrantyDocumentId: 42,
        }),
      ]);
      mockPaperless({ configured: true, available: true, baseUrl: 'https://paperless.example' });
      renderPage();
      const link = await screen.findByText('View Warranty');
      expect(link).toBeInTheDocument();
      expect(link.closest('a')).toHaveAttribute(
        'href',
        'https://paperless.example/documents/42/details'
      );
    });

    it('hides View Warranty link when warrantyDocumentId is null', async () => {
      mockWarranties([
        makeItem({
          id: '1',
          itemName: 'MacBook',
          warrantyExpires: '2030-01-01',
          warrantyDocumentId: null,
        }),
      ]);
      mockPaperless({ configured: true, available: true, baseUrl: 'https://paperless.example' });
      renderPage();
      expect(await screen.findByText('MacBook')).toBeInTheDocument();
      expect(screen.queryByText('View Warranty')).not.toBeInTheDocument();
    });

    it('hides View Warranty link when Paperless not available', async () => {
      mockWarranties([
        makeItem({
          id: '1',
          itemName: 'MacBook',
          warrantyExpires: '2030-01-01',
          warrantyDocumentId: 42,
        }),
      ]);
      mockPaperless({ configured: false, available: false, baseUrl: null });
      renderPage();
      expect(await screen.findByText('MacBook')).toBeInTheDocument();
      expect(screen.queryByText('View Warranty')).not.toBeInTheDocument();
    });
  });
});
