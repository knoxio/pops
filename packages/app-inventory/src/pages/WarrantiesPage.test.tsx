import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router";

const mockWarrantiesQuery = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    inventory: {
      reports: {
        warranties: {
          useQuery: (...args: unknown[]) => mockWarrantiesQuery(...args),
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
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: loaded, empty data
  mockWarrantiesQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
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
    // Skeleton renders multiple placeholder elements
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

  it("expands Expired section when all warranties are expired", () => {
    const pastDate = "2020-01-01";
    mockWarrantiesQuery.mockReturnValue({
      data: {
        data: [
          makeItem({ id: "1", itemName: "Old Laptop", warrantyExpires: pastDate }),
          makeItem({ id: "2", itemName: "Old Phone", warrantyExpires: "2019-06-15" }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    // Expired section should be expanded (defaultOpen) — items should be visible
    expect(screen.getByText("Old Laptop")).toBeInTheDocument();
    expect(screen.getByText("Old Phone")).toBeInTheDocument();
  });

  it("collapses Expired section when active items exist", () => {
    const futureDate = "2030-06-01";
    const pastDate = "2020-01-01";
    mockWarrantiesQuery.mockReturnValue({
      data: {
        data: [
          makeItem({ id: "1", itemName: "New Laptop", warrantyExpires: futureDate }),
          makeItem({ id: "2", itemName: "Old Phone", warrantyExpires: pastDate }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    // Active item should be visible
    expect(screen.getByText("New Laptop")).toBeInTheDocument();
    // Expired section is collapsed by default — items should not be visible
    expect(screen.queryByText("Old Phone")).not.toBeInTheDocument();
  });

  it("shows Expired items after expanding collapsed section", () => {
    const futureDate = "2030-06-01";
    const pastDate = "2020-01-01";
    mockWarrantiesQuery.mockReturnValue({
      data: {
        data: [
          makeItem({ id: "1", itemName: "New Laptop", warrantyExpires: futureDate }),
          makeItem({ id: "2", itemName: "Old Phone", warrantyExpires: pastDate }),
        ],
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    renderPage();
    // Click to expand Expired section
    fireEvent.click(screen.getByText("Expired"));
    expect(screen.getByText("Old Phone")).toBeInTheDocument();
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
    expect(screen.getByText("Expiring Soon")).toBeInTheDocument();
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
});
