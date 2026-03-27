import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

const mocks = vi.hoisted(() => ({
  dashboardQuery: vi.fn(),
  itemsQuery: vi.fn(),
  typesQuery: vi.fn(),
  treeQuery: vi.fn(),
  searchByAssetId: vi.fn(),
  valueByTypeQuery: vi.fn(),
}));

vi.mock("../lib/trpc", () => ({
  trpc: {
    inventory: {
      reports: {
        dashboard: { useQuery: () => mocks.dashboardQuery() },
        valueByType: { useQuery: () => mocks.valueByTypeQuery() },
      },
      items: {
        list: { useQuery: () => mocks.itemsQuery() },
        distinctTypes: { useQuery: () => mocks.typesQuery() },
        searchByAssetId: { fetch: mocks.searchByAssetId },
      },
      locations: {
        tree: { useQuery: () => mocks.treeQuery() },
      },
    },
    useUtils: () => ({
      inventory: {
        items: { searchByAssetId: { fetch: mocks.searchByAssetId } },
      },
    }),
  },
}));

vi.mock("../components/InventoryTable", () => ({
  InventoryTable: () => <div data-testid="inventory-table" />,
}));

vi.mock("../components/InventoryCard", () => ({
  InventoryCard: () => <div data-testid="inventory-card" />,
}));

vi.mock("../components/ValueBreakdown", () => ({
  ValueByTypeCard: () => <div data-testid="value-by-type" />,
}));

import { ItemsPage } from "./ItemsPage";

/** Renders ItemsPage and a catch-all route so we can detect navigation. */
function renderPage(initialPath = "/inventory") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/inventory" element={<ItemsPage />} />
        <Route path="/inventory/warranties" element={<div data-testid="warranties-page" />} />
        <Route path="/inventory/items/:id" element={<div data-testid="item-detail-page" />} />
        <Route path="/inventory/items/new" element={<div data-testid="item-new-page" />} />
      </Routes>
    </MemoryRouter>
  );
}

const emptyDashboard = {
  data: {
    data: {
      itemCount: 0,
      totalReplacementValue: 0,
      totalResaleValue: 0,
      warrantiesExpiringSoon: 0,
      recentlyAdded: [],
    },
  },
};

const populatedDashboard = {
  data: {
    data: {
      itemCount: 42,
      totalReplacementValue: 15000,
      totalResaleValue: 8000,
      warrantiesExpiringSoon: 3,
      recentlyAdded: [
        {
          id: "item-1",
          itemName: "MacBook Pro",
          type: "Electronics",
          assetId: "ELEC-001",
          lastEditedTime: new Date().toISOString(),
        },
        {
          id: "item-2",
          itemName: "Standing Desk",
          type: "Furniture",
          assetId: null,
          lastEditedTime: new Date().toISOString(),
        },
      ],
    },
  },
};

describe("ItemsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.itemsQuery.mockReturnValue({
      data: { data: [], pagination: { total: 0 }, totals: { totalReplacementValue: 0, totalResaleValue: 0 } },
      isLoading: false,
    });
    mocks.typesQuery.mockReturnValue({ data: { data: [] } });
    mocks.treeQuery.mockReturnValue({ data: { data: [] } });
    mocks.valueByTypeQuery.mockReturnValue({ data: null, isLoading: false });
  });

  describe("DashboardWidgets", () => {
    it("renders loading skeletons while data is loading", () => {
      mocks.dashboardQuery.mockReturnValue({ data: null, isLoading: true });
      renderPage();
      expect(screen.queryByText("Warranties")).not.toBeInTheDocument();
    });

    it("renders all widget values with populated data", () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();

      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("expiring")).toBeInTheDocument();
      expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
      expect(screen.getByText("Standing Desk")).toBeInTheDocument();
    });

    it("renders empty state values when inventory is empty", () => {
      mocks.dashboardQuery.mockReturnValue({ ...emptyDashboard, isLoading: false });
      renderPage();

      // Item count shows 0, warranties shows 0 with "expiring" label
      const zeros = screen.getAllByText("0");
      expect(zeros.length).toBeGreaterThanOrEqual(2);
      expect(screen.getByText("No items yet")).toBeInTheDocument();
    });

    it("navigates to /inventory/warranties when warranty widget is clicked", () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();

      const warrantyCard = screen.getByText("Warranties").closest("[role='button']");
      expect(warrantyCard).toBeInTheDocument();
      fireEvent.click(warrantyCard!);
      expect(screen.getByTestId("warranties-page")).toBeInTheDocument();
    });

    it("navigates to /inventory/warranties on Enter key", () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();

      const warrantyCard = screen.getByText("Warranties").closest("[role='button']");
      fireEvent.keyDown(warrantyCard!, { key: "Enter" });
      expect(screen.getByTestId("warranties-page")).toBeInTheDocument();
    });

    it("navigates to /inventory/warranties on Space key", () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();

      const warrantyCard = screen.getByText("Warranties").closest("[role='button']");
      fireEvent.keyDown(warrantyCard!, { key: " " });
      expect(screen.getByTestId("warranties-page")).toBeInTheDocument();
    });

    it("navigates to item detail when recently added item is clicked", () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage();

      fireEvent.click(screen.getByText("MacBook Pro"));
      expect(screen.getByTestId("item-detail-page")).toBeInTheDocument();
    });

    it("does not render dashboard when search is active", () => {
      mocks.dashboardQuery.mockReturnValue({ ...populatedDashboard, isLoading: false });
      renderPage("/inventory?q=test");
      expect(screen.queryByText("Warranties")).not.toBeInTheDocument();
    });
  });
});
