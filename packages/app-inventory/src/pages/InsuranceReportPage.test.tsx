import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

const mockInsuranceReportQuery = vi.fn();
const mockLocationsTreeQuery = vi.fn();
const mockNavigate = vi.fn();

vi.mock("react-router", async () => {
  const actual = await vi.importActual("react-router");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("../lib/trpc", () => ({
  trpc: {
    inventory: {
      reports: {
        insuranceReport: {
          useQuery: (...args: unknown[]) => mockInsuranceReportQuery(...args),
        },
      },
      locations: {
        tree: {
          useQuery: (...args: unknown[]) => mockLocationsTreeQuery(...args),
        },
      },
    },
  },
}));

// Mock UI badge components to avoid complex dependency chain
vi.mock("@pops/ui", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div className={`animate-pulse ${className ?? ""}`} />
  ),
  AssetIdBadge: ({ assetId }: { assetId: string }) => (
    <span data-testid="asset-id-badge">{assetId}</span>
  ),
  ConditionBadge: ({ condition }: { condition: string }) => (
    <span data-testid="condition-badge">{condition}</span>
  ),
  Badge: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <span data-testid="badge" className={className}>
      {children}
    </span>
  ),
}));

/* ------------------------------------------------------------------ */
/*  Mock LocationPicker to avoid popover complexity in tests           */
/* ------------------------------------------------------------------ */
vi.mock("../components/LocationPicker", () => ({
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
      data-value={value ?? ""}
      onClick={() => onChange("loc-1")}
    >
      {value ? `Selected: ${value}` : placeholder}
    </button>
  ),
}));

import { InsuranceReportPage } from "./InsuranceReportPage";

/* ------------------------------------------------------------------ */
/*  Fixtures                                                          */
/* ------------------------------------------------------------------ */
const sampleReport = {
  totalItems: 3,
  totalValue: 5000,
  groups: [
    {
      locationId: "loc-1",
      locationName: "Living Room",
      items: [
        {
          id: "item-1",
          itemName: "Television",
          assetId: "TV-001",
          brand: "Samsung",
          condition: "good",
          warrantyExpires: "2027-06-15",
          replacementValue: 2000,
          photoPath: "tv.jpg",
          locationId: "loc-1",
          locationName: "Living Room",
          receiptDocumentIds: [1234, 5678],
        },
        {
          id: "item-2",
          itemName: "Sofa",
          assetId: null,
          brand: null,
          condition: null,
          warrantyExpires: null,
          replacementValue: 1500,
          photoPath: null,
          locationId: "loc-1",
          locationName: "Living Room",
          receiptDocumentIds: [],
        },
      ],
    },
    {
      locationId: "loc-2",
      locationName: "Kitchen",
      items: [
        {
          id: "item-3",
          itemName: "Toaster",
          assetId: "KIT-003",
          brand: "Breville",
          condition: "fair",
          warrantyExpires: "2025-01-01",
          replacementValue: 1500,
          photoPath: "toaster.jpg",
          locationId: "loc-2",
          locationName: "Kitchen",
          receiptDocumentIds: [9999],
        },
      ],
    },
  ],
};

const locationTree = [
  { id: "loc-1", name: "Living Room", parentId: null, children: [] },
  { id: "loc-2", name: "Kitchen", parentId: null, children: [] },
];

function renderPage(initialEntry = "/inventory/insurance-report") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Routes>
        <Route path="/inventory/insurance-report" element={<InsuranceReportPage />} />
      </Routes>
    </MemoryRouter>
  );
}

/* ------------------------------------------------------------------ */
/*  Tests                                                             */
/* ------------------------------------------------------------------ */
describe("InsuranceReportPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLocationsTreeQuery.mockReturnValue({ data: { data: locationTree } });
  });

  it("shows loading skeleton while data is fetching", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    });
    renderPage();
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
    // The loading state renders Skeleton components
    expect(screen.queryByText("Insurance Report")).not.toBeInTheDocument();
  });

  it("shows error state when report fails to load", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("Failed to load report.")).toBeInTheDocument();
  });

  it("renders report header with title and date", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("Insurance Report")).toBeInTheDocument();
    expect(screen.getByText(/Generated/)).toBeInTheDocument();
  });

  it("renders summary cards with totals", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("$5,000")).toBeInTheDocument();
  });

  it("renders location groups with item counts", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText(/Living Room/)).toBeInTheDocument();
    expect(screen.getByText(/Kitchen/)).toBeInTheDocument();
    expect(screen.getByText("(2 items)")).toBeInTheDocument();
    expect(screen.getByText("(1 item)")).toBeInTheDocument();
  });

  it("renders item details in table rows", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("Television")).toBeInTheDocument();
    expect(screen.getByText("Sofa")).toBeInTheDocument();
    expect(screen.getByText("Toaster")).toBeInTheDocument();
    expect(screen.getByText("Samsung")).toBeInTheDocument();
  });

  it("renders photo with alt text when photoPath exists", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const img = screen.getByAltText("Photo of Television");
    expect(img).toBeInTheDocument();
    expect(img).toHaveAttribute("src", "/inventory/photos/tv.jpg");
  });

  it("renders photo thumbnails with print max-width class", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const img = screen.getByAltText("Photo of Television");
    expect(img).toBeInTheDocument();
    expect(img.className).toContain("print:max-w-[200px]");
  });

  it("renders photo thumbnails with break-inside-avoid for print", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const img = screen.getByAltText("Photo of Television");
    expect(img?.className).toContain("print:break-inside-avoid");
  });

  it("renders fallback div with aria-label when no photo", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const fallbacks = screen.getAllByLabelText("No photo available");
    expect(fallbacks.length).toBeGreaterThan(0);
  });

  it("shows expired warranty badge", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows None for items without warranty", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("None")).toBeInTheDocument();
  });

  it("shows dashes for null values", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    // Sofa has no brand, condition — should show dashes
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("renders location picker with All locations placeholder", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const picker = screen.getByTestId("location-picker");
    expect(picker).toHaveTextContent("All locations");
  });

  it("passes locationId to location picker when in URL", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage("/inventory/insurance-report?locationId=loc-1");
    const picker = screen.getByTestId("location-picker");
    expect(picker).toHaveAttribute("data-value", "loc-1");
  });

  it("renders Export CSV button", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("Export CSV")).toBeInTheDocument();
  });

  it("renders Print / PDF button", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("Print / PDF")).toBeInTheDocument();
  });

  it("applies break-inside-avoid to item rows for print", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBe(3); // 2 items in Living Room + 1 in Kitchen
    rows.forEach((row) => {
      expect(row.className).toContain("print:break-inside-avoid");
    });
  });

  it("applies page-break-before on second location group (not first)", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const headers = document.querySelectorAll("h2");
    expect(headers.length).toBe(2);
    const firstGroup = headers[0]!.parentElement!;
    expect(firstGroup.className).not.toContain("print:break-before-page");
    const secondGroup = headers[1]!.parentElement!;
    expect(secondGroup.className).toContain("print:break-before-page");
  });

  it("applies print font sizes to section headers", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const headers = document.querySelectorAll("h2");
    headers.forEach((h) => {
      expect(h.className).toContain("print:text-[14pt]");
    });
  });

  it("applies print base font size to container", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const container = document.querySelector("[class*='print:text-\\[11pt\\]']");
    expect(container).toBeInTheDocument();
  });

  it("applies print border classes to table for structure", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const tables = document.querySelectorAll("table");
    tables.forEach((table) => {
      expect(table.className).toContain("print:border");
      expect(table.className).toContain("print:border-gray-300");
    });
  });

  it("removes badge backgrounds for print", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const badges = screen.getAllByTestId("badge");
    badges.forEach((badge) => {
      expect(badge.className).toContain("print:bg-transparent");
    });
  });

  it("shows empty state when no items found", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: { totalItems: 0, totalValue: 0, groups: [] } },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("No inventory items found.")).toBeInTheDocument();
  });

  it("calls window.print when Print / PDF button is clicked", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderPage();
    const printBtn = screen.getByText("Print / PDF");
    fireEvent.click(printBtn);
    expect(printSpy).toHaveBeenCalled();
    printSpy.mockRestore();
  });

  it("triggers CSV download when Export CSV is clicked", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    const createObjectURLSpy = vi.fn(() => "blob:test");
    const revokeObjectURLSpy = vi.fn();
    global.URL.createObjectURL = createObjectURLSpy;
    global.URL.revokeObjectURL = revokeObjectURLSpy;

    renderPage();
    const csvBtn = screen.getByText("Export CSV");
    fireEvent.click(csvBtn);
    expect(createObjectURLSpy).toHaveBeenCalled();
    expect(revokeObjectURLSpy).toHaveBeenCalled();
  });

  it("shows include sub-locations toggle when location is selected", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage("/inventory/insurance-report?locationId=loc-1");
    expect(screen.getByLabelText("Include sub-locations")).toBeInTheDocument();
  });

  it("hides include sub-locations toggle when no location selected", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    expect(screen.queryByLabelText("Include sub-locations")).not.toBeInTheDocument();
  });

  it("renders sort selector with default value", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    const select = screen.getByDisplayValue("Value (high first)");
    expect(select).toBeInTheDocument();
  });

  it("renders sort selector with URL param value", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage("/inventory/insurance-report?sortBy=name");
    const select = screen.getByDisplayValue("Name");
    expect(select).toBeInTheDocument();
  });

  it("renders receipt document IDs for items that have them", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("#1234, #5678")).toBeInTheDocument();
    expect(screen.getByText("#9999")).toBeInTheDocument();
  });

  it("passes sortBy and includeChildren to query", () => {
    mockInsuranceReportQuery.mockReturnValue({
      data: { data: sampleReport },
      isLoading: false,
    });
    renderPage("/inventory/insurance-report?locationId=loc-1&sortBy=name&includeChildren=false");
    expect(mockInsuranceReportQuery).toHaveBeenCalledWith(
      expect.objectContaining({
        locationId: "loc-1",
        sortBy: "name",
        includeChildren: false,
      })
    );
  });
});
