import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mockWarrantiesQuery = vi.fn();
const mockPaperlessStatusQuery = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    inventory: {
      reports: {
        warranties: {
          useQuery: (...args: unknown[]) => mockWarrantiesQuery(...args),
        },
      },
      paperless: {
        status: {
          useQuery: (...args: unknown[]) => mockPaperlessStatusQuery(...args),
        },
      },
    },
  },
}));

import { WarrantiesPage } from "./WarrantiesPage";

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/inventory/warranties"]}>
      <WarrantiesPage />
    </MemoryRouter>
  );
}

function makeItem(
  overrides: Partial<{
    id: string;
    itemName: string;
    warrantyExpires: string | null;
    assetId: string | null;
    brand: string | null;
    model: string | null;
    replacementValue: number | null;
    warrantyDocumentId: number | null;
  }> = {}
) {
  return {
    id: overrides.id ?? "item-1",
    itemName: overrides.itemName ?? "Test Item",
    warrantyExpires: overrides.warrantyExpires ?? null,
    assetId: overrides.assetId ?? null,
    brand: overrides.brand ?? null,
    model: overrides.model ?? null,
    replacementValue: overrides.replacementValue ?? null,
    warrantyDocumentId: overrides.warrantyDocumentId ?? null,
  };
}

/** Return an ISO date string N days from today. */
function daysFromNow(days: number): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockWarrantiesQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  });
  mockPaperlessStatusQuery.mockReturnValue({
    data: { data: { configured: false, available: false, baseUrl: null } },
  });
});

describe("WarrantiesPage", () => {
  it("shows loading skeleton", () => {
    mockWarrantiesQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.queryByText("No items with warranty dates")).not.toBeInTheDocument();
    expect(screen.queryByText("Browse Items")).not.toBeInTheDocument();
  });

  it("shows empty state with Browse Items link", () => {
    renderPage();
    expect(screen.getByText(/No items with warranty dates/)).toBeInTheDocument();
    const link = screen.getByText("Browse Items");
    expect(link).toBeInTheDocument();
    expect(link.closest("a")).toHaveAttribute("href", "/inventory/items");
  });

  it("shows error state with retry button", () => {
    const mockRefetch = vi.fn();
    mockWarrantiesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    });
    renderPage();
    expect(screen.getByText(/Could not load warranties/)).toBeInTheDocument();
    const retryBtn = screen.getByText("Retry");
    fireEvent.click(retryBtn);
    expect(mockRefetch).toHaveBeenCalledTimes(1);
  });

  describe("5-tier grouping", () => {
    it("shows critical tier for items under 30 days", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [makeItem({ id: "1", itemName: "Laptop", warrantyExpires: daysFromNow(10) })],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.getByText("Critical — Under 30 Days")).toBeInTheDocument();
      expect(screen.getByText("Laptop")).toBeInTheDocument();
    });

    it("shows warning tier for items 30-60 days", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [makeItem({ id: "1", itemName: "Tablet", warrantyExpires: daysFromNow(45) })],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.getByText("Warning — 30 to 60 Days")).toBeInTheDocument();
      expect(screen.getByText("Tablet")).toBeInTheDocument();
    });

    it("shows caution tier for items 60-90 days", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [makeItem({ id: "1", itemName: "Monitor", warrantyExpires: daysFromNow(75) })],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.getByText("Caution — 60 to 90 Days")).toBeInTheDocument();
      expect(screen.getByText("Monitor")).toBeInTheDocument();
    });

    it("shows active tier for items over 90 days", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [makeItem({ id: "1", itemName: "Phone", warrantyExpires: daysFromNow(200) })],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Phone")).toBeInTheDocument();
    });

    it("shows expired tier for past-date items", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [makeItem({ id: "1", itemName: "Old Laptop", warrantyExpires: "2020-01-01" })],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.getByText("Expired")).toBeInTheDocument();
      // Expired section auto-expands when it's the only tier
      expect(screen.getByText("Old Laptop")).toBeInTheDocument();
    });

    it("groups items across all 5 tiers simultaneously", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [
            makeItem({ id: "1", itemName: "Critical Item", warrantyExpires: daysFromNow(5) }),
            makeItem({ id: "2", itemName: "Warning Item", warrantyExpires: daysFromNow(40) }),
            makeItem({ id: "3", itemName: "Caution Item", warrantyExpires: daysFromNow(70) }),
            makeItem({ id: "4", itemName: "Active Item", warrantyExpires: daysFromNow(180) }),
            makeItem({ id: "5", itemName: "Expired Item", warrantyExpires: "2020-01-01" }),
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.getByText("Critical — Under 30 Days")).toBeInTheDocument();
      expect(screen.getByText("Warning — 30 to 60 Days")).toBeInTheDocument();
      expect(screen.getByText("Caution — 60 to 90 Days")).toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Expired")).toBeInTheDocument();
      // Expiring tiers always visible (not collapsible)
      expect(screen.getByText("Critical Item")).toBeInTheDocument();
      expect(screen.getByText("Warning Item")).toBeInTheDocument();
      expect(screen.getByText("Caution Item")).toBeInTheDocument();
      // Active expanded by default
      expect(screen.getByText("Active Item")).toBeInTheDocument();
      // Expired collapsed when other items exist
      expect(screen.queryByText("Expired Item")).not.toBeInTheDocument();
    });
  });

  describe("collapsible behavior", () => {
    it("expands Expired section when all warranties are expired", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [
            makeItem({ id: "1", itemName: "Old Laptop", warrantyExpires: "2020-01-01" }),
            makeItem({ id: "2", itemName: "Old Phone", warrantyExpires: "2019-06-15" }),
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.getByText("Old Laptop")).toBeInTheDocument();
      expect(screen.getByText("Old Phone")).toBeInTheDocument();
    });

    it("collapses Expired section when active items exist", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [
            makeItem({ id: "1", itemName: "New Laptop", warrantyExpires: daysFromNow(200) }),
            makeItem({ id: "2", itemName: "Old Phone", warrantyExpires: "2020-01-01" }),
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.getByText("New Laptop")).toBeInTheDocument();
      expect(screen.queryByText("Old Phone")).not.toBeInTheDocument();
    });

    it("shows Expired items after expanding collapsed section", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [
            makeItem({ id: "1", itemName: "New Laptop", warrantyExpires: daysFromNow(200) }),
            makeItem({ id: "2", itemName: "Old Phone", warrantyExpires: "2020-01-01" }),
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage();
      fireEvent.click(screen.getByText("Expired"));
      expect(screen.getByText("Old Phone")).toBeInTheDocument();
    });

    it("collapses Expired when expiring items exist (not just active)", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [
            makeItem({ id: "1", itemName: "Expiring Item", warrantyExpires: daysFromNow(15) }),
            makeItem({ id: "2", itemName: "Expired Item", warrantyExpires: "2020-01-01" }),
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.getByText("Expiring Item")).toBeInTheDocument();
      expect(screen.queryByText("Expired Item")).not.toBeInTheDocument();
    });
  });

  describe("empty tiers are hidden", () => {
    it("does not render tier headers for empty tiers", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [makeItem({ id: "1", itemName: "Active Only", warrantyExpires: daysFromNow(200) })],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      renderPage();
      expect(screen.queryByText("Critical — Under 30 Days")).not.toBeInTheDocument();
      expect(screen.queryByText("Warning — 30 to 60 Days")).not.toBeInTheDocument();
      expect(screen.queryByText("Caution — 60 to 90 Days")).not.toBeInTheDocument();
      expect(screen.queryByText("Expired")).not.toBeInTheDocument();
      expect(screen.getByText("Active")).toBeInTheDocument();
    });
  });

  it("shows brand and model in warranty row", () => {
    mockWarrantiesQuery.mockReturnValue({
      data: {
        data: [
          makeItem({
            id: "1",
            itemName: "Laptop",
            brand: "Apple",
            model: "MacBook Pro",
            warrantyExpires: "2030-01-01",
          }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText("Laptop")).toBeInTheDocument();
    expect(screen.getByText("Apple MacBook Pro")).toBeInTheDocument();
  });

  it("shows brand only when model is null", () => {
    mockWarrantiesQuery.mockReturnValue({
      data: {
        data: [
          makeItem({
            id: "1",
            itemName: "TV",
            brand: "Samsung",
            model: null,
            warrantyExpires: "2030-01-01",
          }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText("Samsung")).toBeInTheDocument();
  });

  it("shows days-remaining badge for active warranties", () => {
    mockWarrantiesQuery.mockReturnValue({
      data: {
        data: [makeItem({ id: "1", itemName: "Active Item", warrantyExpires: "2030-06-01" })],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    // Active items (>90 days) should show a days-remaining badge
    expect(screen.getByText("Active Item")).toBeInTheDocument();
    expect(screen.getByText(/days$/)).toBeInTheDocument();
  });

  it("shows urgency badge for expiring soon items", () => {
    // Set warranty to expire in 10 days from now
    const soon = new Date();
    soon.setDate(soon.getDate() + 10);
    const soonStr = soon.toISOString().slice(0, 10);

    mockWarrantiesQuery.mockReturnValue({
      data: {
        data: [makeItem({ id: "1", itemName: "Urgent Item", warrantyExpires: soonStr })],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText("Urgent Item")).toBeInTheDocument();
    // Item is in the Critical tier (< 30 days) with a days-remaining badge
    expect(screen.getByText("Critical — Under 30 Days")).toBeInTheDocument();
    expect(screen.getByText("10 days")).toBeInTheDocument();
  });

  it("shows expired time ago text", () => {
    mockWarrantiesQuery.mockReturnValue({
      data: {
        data: [makeItem({ id: "1", itemName: "Old Item", warrantyExpires: "2020-01-01" })],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    // Only expired items → section defaults open
    expect(screen.getByText("Old Item")).toBeInTheDocument();
    expect(screen.getByText(/d ago$/)).toBeInTheDocument();
  });

  it("sorts expiring soon section by soonest first", () => {
    const soon1 = new Date();
    soon1.setDate(soon1.getDate() + 5);
    const soon2 = new Date();
    soon2.setDate(soon2.getDate() + 30);

    mockWarrantiesQuery.mockReturnValue({
      data: {
        data: [
          makeItem({
            id: "2",
            itemName: "Later Expiry",
            warrantyExpires: soon2.toISOString().slice(0, 10),
          }),
          makeItem({
            id: "1",
            itemName: "Sooner Expiry",
            warrantyExpires: soon1.toISOString().slice(0, 10),
          }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    const buttons = screen.getAllByRole("button").filter((b) => b.textContent?.includes("Expiry"));
    expect(buttons[0]!.textContent).toContain("Sooner Expiry");
    expect(buttons[1]!.textContent).toContain("Later Expiry");
  });

  it("shows asset ID badge when present", () => {
    mockWarrantiesQuery.mockReturnValue({
      data: {
        data: [
          makeItem({
            id: "1",
            itemName: "Tagged Item",
            assetId: "INV-001",
            warrantyExpires: "2030-01-01",
          }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    expect(screen.getByText("INV-001")).toBeInTheDocument();
  });

  describe("warranty document link", () => {
    it("shows View Warranty link when document and Paperless configured", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [
            makeItem({
              id: "1",
              itemName: "MacBook",
              warrantyExpires: "2030-01-01",
              warrantyDocumentId: 42,
            }),
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      mockPaperlessStatusQuery.mockReturnValue({
        data: { data: { configured: true, available: true, baseUrl: "https://paperless.example" } },
      });
      renderPage();
      const link = screen.getByText("View Warranty");
      expect(link).toBeInTheDocument();
      expect(link.closest("a")).toHaveAttribute(
        "href",
        "https://paperless.example/documents/42/details"
      );
    });

    it("hides View Warranty link when warrantyDocumentId is null", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [
            makeItem({
              id: "1",
              itemName: "MacBook",
              warrantyExpires: "2030-01-01",
              warrantyDocumentId: null,
            }),
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      mockPaperlessStatusQuery.mockReturnValue({
        data: { data: { configured: true, available: true, baseUrl: "https://paperless.example" } },
      });
      renderPage();
      expect(screen.queryByText("View Warranty")).not.toBeInTheDocument();
    });

    it("hides View Warranty link when Paperless not available", () => {
      mockWarrantiesQuery.mockReturnValue({
        data: {
          data: [
            makeItem({
              id: "1",
              itemName: "MacBook",
              warrantyExpires: "2030-01-01",
              warrantyDocumentId: 42,
            }),
          ],
        },
        isLoading: false,
        isError: false,
        refetch: vi.fn(),
      });
      mockPaperlessStatusQuery.mockReturnValue({
        data: { data: { configured: false, available: false, baseUrl: null } },
      });
      renderPage();
      expect(screen.queryByText("View Warranty")).not.toBeInTheDocument();
    });
  });
});
