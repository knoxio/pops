import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router";

const mockReportQuery = vi.fn();
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
          useQuery: (...args: unknown[]) => mockReportQuery(...args),
        },
      },
    },
  },
}));

// Mock UI badge components to avoid complex dependency chain
vi.mock("@pops/ui", () => ({
  Skeleton: ({ className }: { className?: string }) => <div className={`animate-pulse ${className ?? ""}`} />,
  AssetIdBadge: ({ assetId }: { assetId: string }) => <span data-testid="asset-id-badge">{assetId}</span>,
  ConditionBadge: ({ condition }: { condition: string }) => (
    <span data-testid="condition-badge">{condition}</span>
  ),
  Badge: ({ children, className }: { children: React.ReactNode; variant?: string; className?: string }) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}));

import { InsuranceReportPage } from "./InsuranceReportPage";

const mockReport = {
  data: {
    totalItems: 5,
    totalValue: 15000,
    groups: [
      {
        locationId: "loc-1",
        locationName: "Living Room",
        items: [
          {
            id: "item-1",
            itemName: "MacBook Pro",
            assetId: "ELEC01",
            brand: "Apple",
            condition: "Excellent",
            warrantyExpires: "2027-06-15",
            replacementValue: 3500,
            photoPath: "macbook.jpg",
            locationId: "loc-1",
            locationName: "Living Room",
          },
          {
            id: "item-2",
            itemName: "Monitor",
            assetId: null,
            brand: null,
            condition: null,
            warrantyExpires: null,
            replacementValue: null,
            photoPath: null,
            locationId: "loc-1",
            locationName: "Living Room",
          },
        ],
      },
      {
        locationId: "loc-2",
        locationName: "Office",
        items: [
          {
            id: "item-3",
            itemName: "Desk",
            assetId: "FURN01",
            brand: "IKEA",
            condition: "Good",
            warrantyExpires: null,
            replacementValue: 800,
            photoPath: null,
            locationId: "loc-2",
            locationName: "Office",
          },
        ],
      },
    ],
  },
};

function renderPage(locationId?: string) {
  const path = locationId
    ? `/inventory/report?locationId=${locationId}`
    : "/inventory/report";
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/inventory/report" element={<InsuranceReportPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReportQuery.mockReturnValue({
    data: mockReport,
    isLoading: false,
  });
});

describe("InsuranceReportPage", () => {
  it("renders report title", () => {
    renderPage();
    expect(screen.getByText("Insurance Report")).toBeInTheDocument();
  });

  it("renders total items and total value", () => {
    renderPage();
    expect(screen.getByText("5")).toBeInTheDocument();
  });

  it("renders Print button", () => {
    renderPage();
    expect(screen.getByText("Print")).toBeInTheDocument();
  });

  it("renders location group headers", () => {
    renderPage();
    expect(screen.getByText(/Living Room/)).toBeInTheDocument();
    expect(screen.getByText(/Office/)).toBeInTheDocument();
  });

  it("renders item names", () => {
    renderPage();
    expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
    expect(screen.getByText("Monitor")).toBeInTheDocument();
    expect(screen.getByText("Desk")).toBeInTheDocument();
  });

  it("renders photo thumbnails with print max-width class", () => {
    renderPage();
    const img = document.querySelector('img[src*="macbook.jpg"]');
    expect(img).toBeInTheDocument();
    expect(img?.className).toContain("print:max-w-[200px]");
  });

  it("renders photo thumbnails with break-inside-avoid for print", () => {
    renderPage();
    const img = document.querySelector('img[src*="macbook.jpg"]');
    expect(img?.className).toContain("print:break-inside-avoid");
  });

  it("applies break-inside-avoid to item rows for print", () => {
    renderPage();
    const rows = document.querySelectorAll("tbody tr");
    expect(rows.length).toBe(3); // 2 items in Living Room + 1 in Office
    rows.forEach((row) => {
      expect(row.className).toContain("print:break-inside-avoid");
    });
  });

  it("applies page-break-before on second location group (not first)", () => {
    renderPage();
    // Location groups are divs containing h2 headers
    const headers = document.querySelectorAll("h2");
    expect(headers.length).toBe(2);
    // First group parent should NOT have break-before-page
    const firstGroup = headers[0]!.parentElement!;
    expect(firstGroup.className).not.toContain("print:break-before-page");
    // Second group parent should have break-before-page
    const secondGroup = headers[1]!.parentElement!;
    expect(secondGroup.className).toContain("print:break-before-page");
  });

  it("applies print font sizes to section headers", () => {
    renderPage();
    const headers = document.querySelectorAll("h2");
    headers.forEach((h) => {
      expect(h.className).toContain("print:text-[14pt]");
    });
  });

  it("applies print base font size to container", () => {
    renderPage();
    const container = document.querySelector("[class*='print:text-\\[11pt\\]']");
    expect(container).toBeInTheDocument();
  });

  it("applies print border classes to table for structure", () => {
    renderPage();
    const tables = document.querySelectorAll("table");
    tables.forEach((table) => {
      expect(table.className).toContain("print:border");
      expect(table.className).toContain("print:border-gray-300");
    });
  });

  it("removes badge backgrounds for print", () => {
    renderPage();
    const badges = screen.getAllByTestId("badge");
    badges.forEach((badge) => {
      expect(badge.className).toContain("print:bg-transparent");
    });
  });

  it("shows dashes for null values", () => {
    renderPage();
    // Monitor has no brand, condition, value — should show dashes
    const dashes = screen.getAllByText("—");
    expect(dashes.length).toBeGreaterThan(0);
  });

  it("shows loading skeleton", () => {
    mockReportQuery.mockReturnValue({ data: null, isLoading: true });
    renderPage();
    expect(document.querySelector(".animate-pulse")).toBeInTheDocument();
  });

  it("shows empty state when no groups", () => {
    mockReportQuery.mockReturnValue({
      data: { data: { totalItems: 0, totalValue: 0, groups: [] } },
      isLoading: false,
    });
    renderPage();
    expect(screen.getByText("No inventory items found.")).toBeInTheDocument();
  });

  it("shows error state when report fails to load", () => {
    mockReportQuery.mockReturnValue({ data: null, isLoading: false });
    renderPage();
    expect(screen.getByText("Failed to load report.")).toBeInTheDocument();
  });
});
