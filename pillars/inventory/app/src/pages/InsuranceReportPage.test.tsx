import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  LocationsTreeResponses,
  ReportsInsuranceReportResponses,
} from '../inventory-api/types.gen';

const { reportsInsuranceReportMock, locationsTreeMock, navigateMock } = vi.hoisted(() => ({
  reportsInsuranceReportMock: vi.fn(),
  locationsTreeMock: vi.fn(),
  navigateMock: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  reportsInsuranceReport: (...args: unknown[]) => reportsInsuranceReportMock(...args),
  locationsTree: (...args: unknown[]) => locationsTreeMock(...args),
}));

vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return {
    ...actual,
    useNavigate: () => navigateMock,
  };
});

vi.mock('../components/LocationPicker', () => ({
  LocationPicker: ({
    value,
    onChange,
    placeholder,
  }: {
    value: string | null;
    onChange: (id: string | null) => void;
    placeholder: string;
  }) => (
    <button
      data-testid="location-picker"
      data-value={value ?? ''}
      onClick={() => {
        onChange('loc-1');
      }}
    >
      {value ? `Selected: ${value}` : placeholder}
    </button>
  ),
}));

import { InsuranceReportPage } from './InsuranceReportPage';

type ReportPayload = NonNullable<ReportsInsuranceReportResponses[200]>;
type ReportSummary = ReportPayload['data'];
type TreePayload = NonNullable<LocationsTreeResponses[200]>;

const sampleReport: ReportSummary = {
  totalItems: 3,
  totalValue: 5000,
  groups: [
    {
      locationId: 'loc-1',
      locationName: 'Living Room',
      items: [
        {
          id: 'item-1',
          itemName: 'Television',
          assetId: 'TV-001',
          brand: 'Samsung',
          condition: 'good',
          warrantyExpires: '2027-06-15',
          replacementValue: 2000,
          photoPath: 'tv.jpg',
          locationId: 'loc-1',
          locationName: 'Living Room',
          type: null,
          receiptDocumentIds: [1234, 5678],
        },
        {
          id: 'item-2',
          itemName: 'Sofa',
          assetId: null,
          brand: null,
          condition: null,
          warrantyExpires: null,
          replacementValue: 1500,
          photoPath: null,
          locationId: 'loc-1',
          locationName: 'Living Room',
          type: null,
          receiptDocumentIds: [],
        },
      ],
    },
    {
      locationId: 'loc-2',
      locationName: 'Kitchen',
      items: [
        {
          id: 'item-3',
          itemName: 'Toaster',
          assetId: 'KIT-003',
          brand: 'Breville',
          condition: 'fair',
          warrantyExpires: '2025-01-01',
          replacementValue: 1500,
          photoPath: 'toaster.jpg',
          locationId: 'loc-2',
          locationName: 'Kitchen',
          type: null,
          receiptDocumentIds: [9999],
        },
      ],
    },
  ],
};

const locationTree: TreePayload['data'] = [
  { id: 'loc-1', name: 'Living Room', parentId: null, sortOrder: 0, children: [] },
  { id: 'loc-2', name: 'Kitchen', parentId: null, sortOrder: 1, children: [] },
];

function mockReportSuccess(summary: ReportSummary): void {
  reportsInsuranceReportMock.mockImplementation(async () => ({
    data: { data: summary } satisfies ReportPayload,
    error: undefined,
  }));
}

function mockReportUnavailable(message = 'boom'): void {
  reportsInsuranceReportMock.mockImplementation(async () => ({
    data: undefined,
    error: { message },
    response: { status: 500 },
  }));
}

function mockReportNeverResolves(): void {
  reportsInsuranceReportMock.mockImplementation(
    () => new Promise(() => undefined) as Promise<{ data: ReportPayload; error: undefined }>
  );
}

function renderPage(initialEntry = '/inventory/insurance-report'): ReturnType<typeof render> {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Routes>
          <Route path="/inventory/insurance-report" element={<InsuranceReportPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function lastReportQuery(): Record<string, unknown> | undefined {
  const lastCall = reportsInsuranceReportMock.mock.lastCall;
  if (!lastCall) return undefined;
  const [args] = lastCall as [{ query?: Record<string, unknown> }];
  return args?.query;
}

describe('InsuranceReportPage', () => {
  beforeEach(() => {
    reportsInsuranceReportMock.mockReset();
    locationsTreeMock.mockReset();
    navigateMock.mockReset();
    locationsTreeMock.mockImplementation(async () => ({
      data: { data: locationTree } satisfies TreePayload,
      error: undefined,
    }));
  });

  it('shows loading skeleton while data is fetching', () => {
    mockReportNeverResolves();
    renderPage();
    expect(document.querySelector('.animate-pulse')).toBeInTheDocument();
    expect(screen.queryByText('Insurance Report')).not.toBeInTheDocument();
  });

  it('shows error state when report is unavailable', async () => {
    mockReportUnavailable();
    renderPage();
    expect(await screen.findByText('Failed to load report.')).toBeInTheDocument();
  });

  it('renders report header with title and date', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    expect(await screen.findByText('Insurance Report')).toBeInTheDocument();
    expect(screen.getByText(/Generated/)).toBeInTheDocument();
  });

  it('renders summary cards with totals', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    expect(await screen.findByText('3')).toBeInTheDocument();
    expect(screen.getByText('$5,000')).toBeInTheDocument();
  });

  it('renders location groups with item counts', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    expect(await screen.findByText(/Living Room/)).toBeInTheDocument();
    expect(screen.getByText(/Kitchen/)).toBeInTheDocument();
    expect(screen.getByText('(2 items)')).toBeInTheDocument();
    expect(screen.getByText('(1 item)')).toBeInTheDocument();
  });

  it('renders item details in table rows', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    expect(await screen.findByText('Television')).toBeInTheDocument();
    expect(screen.getByText('Sofa')).toBeInTheDocument();
    expect(screen.getByText('Toaster')).toBeInTheDocument();
    expect(screen.getByText('Samsung')).toBeInTheDocument();
  });

  it('renders photo with alt text when photoPath exists', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    const img = await screen.findByAltText('Photo of Television');
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute('src', '/inventory/photos/tv.jpg');
  });

  it('renders photo thumbnails with print max-width class', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    const img = await screen.findByAltText('Photo of Television');
    expect(img).toBeInTheDocument();
    expect(img.className).toContain('print:max-w-50');
  });

  it('renders photo thumbnails with break-inside-avoid for print', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    const img = await screen.findByAltText('Photo of Television');
    expect(img?.className).toContain('print:break-inside-avoid');
  });

  it('renders fallback div with aria-label when no photo', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    const fallbacks = await screen.findAllByLabelText('No photo available');
    expect(fallbacks.length).toBeGreaterThan(0);
  });

  it('shows expired warranty badge', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    expect(await screen.findByText('Expired')).toBeInTheDocument();
  });

  it('shows None for items without warranty', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    expect(await screen.findByText('None')).toBeInTheDocument();
  });

  it('shows dashes for null values', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    const dashes = await screen.findAllByText('—');
    expect(dashes.length).toBeGreaterThan(0);
  });

  it('renders location picker with All locations placeholder', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    const picker = await screen.findByTestId('location-picker');
    expect(picker).toHaveTextContent('All locations');
  });

  it('passes locationId to location picker when in URL', async () => {
    mockReportSuccess(sampleReport);
    renderPage('/inventory/insurance-report?locationId=loc-1');
    const picker = await screen.findByTestId('location-picker');
    expect(picker).toHaveAttribute('data-value', 'loc-1');
  });

  it('renders Export CSV button', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    expect(await screen.findByText('Export CSV')).toBeInTheDocument();
  });

  it('renders Print / PDF button', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    expect(await screen.findByText('Print / PDF')).toBeInTheDocument();
  });

  it('applies break-inside-avoid to item rows for print', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    await screen.findByText('Television');
    const rows = document.querySelectorAll('tbody tr');
    expect(rows.length).toBe(3);
    rows.forEach((row) => {
      expect(row.className).toContain('print:break-inside-avoid');
    });
  });

  it('applies page-break-before on second location group (not first)', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    await screen.findByText('Television');
    const headers = document.querySelectorAll('h2');
    expect(headers.length).toBe(2);
    const firstGroup = headers[0]!.parentElement!;
    expect(firstGroup.className).not.toContain('print:break-before-page');
    const secondGroup = headers[1]!.parentElement!;
    expect(secondGroup.className).toContain('print:break-before-page');
  });

  it('applies print font sizes to section headers', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    await screen.findByText('Television');
    const headers = document.querySelectorAll('h2');
    headers.forEach((h) => {
      expect(h.className).toContain('print:text-[14pt]');
    });
  });

  it('applies print base font size to container', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    await screen.findByText('Television');
    const container = document.querySelector("[class*='print:text-\\[11pt\\]']");
    expect(container).toBeInTheDocument();
  });

  it('applies print border classes to table for structure', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    await screen.findByText('Television');
    const tables = document.querySelectorAll('table');
    tables.forEach((table) => {
      expect(table.className).toContain('print:border');
      expect(table.className).toContain('print:border-gray-300');
    });
  });

  it('removes badge backgrounds for print', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    await screen.findByText('Television');
    const warrantyBadges = document.querySelectorAll(
      '[data-slot="badge"][class*="print:bg-transparent"]'
    );
    expect(warrantyBadges.length).toBe(3);
    warrantyBadges.forEach((badge) => {
      expect(badge.className).toContain('print:border');
      expect(badge.className).toContain('print:text-black');
    });
  });

  it('shows empty state when no items found', async () => {
    mockReportSuccess({ totalItems: 0, totalValue: 0, groups: [] });
    renderPage();
    expect(await screen.findByText('No inventory items found.')).toBeInTheDocument();
  });

  it('calls window.print when Print / PDF button is clicked', async () => {
    mockReportSuccess(sampleReport);
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    renderPage();
    const printBtn = await screen.findByText('Print / PDF');
    fireEvent.click(printBtn);
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it('triggers CSV download when Export CSV is clicked', async () => {
    mockReportSuccess(sampleReport);
    const createObjectURLSpy = vi.fn(() => 'blob:test');
    const revokeObjectURLSpy = vi.fn();
    global.URL.createObjectURL = createObjectURLSpy;
    global.URL.revokeObjectURL = revokeObjectURLSpy;

    renderPage();
    const csvBtn = await screen.findByText('Export CSV');
    fireEvent.click(csvBtn);
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it('shows include sub-locations toggle when location is selected', async () => {
    mockReportSuccess(sampleReport);
    renderPage('/inventory/insurance-report?locationId=loc-1');
    expect(await screen.findByLabelText('Include sub-locations')).toBeInTheDocument();
  });

  it('hides include sub-locations toggle when no location selected', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    await screen.findByText('Television');
    expect(screen.queryByLabelText('Include sub-locations')).not.toBeInTheDocument();
  });

  it('renders sort selector with default value', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    const select = await screen.findByDisplayValue('Value (high first)');
    expect(select).toBeInTheDocument();
  });

  it('renders sort selector with URL param value', async () => {
    mockReportSuccess(sampleReport);
    renderPage('/inventory/insurance-report?sortBy=name');
    const select = await screen.findByDisplayValue('Name');
    expect(select).toBeInTheDocument();
  });

  it('renders receipt document IDs for items that have them', async () => {
    mockReportSuccess(sampleReport);
    renderPage();
    expect(await screen.findByText('#1234, #5678')).toBeInTheDocument();
    expect(screen.getByText('#9999')).toBeInTheDocument();
  });

  it('passes sortBy and includeChildren to the report query', async () => {
    mockReportSuccess(sampleReport);
    renderPage('/inventory/insurance-report?locationId=loc-1&sortBy=name&includeChildren=false');
    await waitFor(() =>
      expect(lastReportQuery()).toEqual(
        expect.objectContaining({
          locationId: 'loc-1',
          sortBy: 'name',
          includeChildren: false,
        })
      )
    );
  });
});
