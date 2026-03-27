import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";

// Mock trpc hooks
const mockItemQuery = vi.fn();
const mockConnectionsQuery = vi.fn();
const mockPhotosQuery = vi.fn();
const mockLocationPathQuery = vi.fn();
const mockDeleteMutate = vi.fn();
const mockDeleteMutation = vi.fn();
const mockDisconnectMutation = vi.fn();
const mockUseUtils = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    inventory: {
      items: {
        get: { useQuery: (...args: unknown[]) => mockItemQuery(...args) },
        delete: { useMutation: (...args: unknown[]) => mockDeleteMutation(...args) },
      },
      connections: {
        listForItem: { useQuery: (...args: unknown[]) => mockConnectionsQuery(...args) },
        disconnect: { useMutation: (...args: unknown[]) => mockDisconnectMutation(...args) },
      },
      photos: {
        listForItem: { useQuery: (...args: unknown[]) => mockPhotosQuery(...args) },
      },
      locations: {
        getPath: { useQuery: (...args: unknown[]) => mockLocationPathQuery(...args) },
      },
      paperless: {
        status: { useQuery: () => ({ data: null, isLoading: false }) },
      },
      documents: {
        listForItem: { useQuery: () => ({ data: { data: [] }, isLoading: false }) },
        unlink: { useMutation: () => ({ mutate: vi.fn(), isPending: false }) },
      },
    },
    useUtils: () => mockUseUtils(),
  },
}));

// Mock sub-components that need their own tRPC context
vi.mock("../components/ConnectDialog", () => ({
  ConnectDialog: () => <button>Connect</button>,
}));
vi.mock("../components/ConnectionTracePanel", () => ({
  ConnectionTracePanel: () => <div data-testid="trace-panel" />,
}));
vi.mock("../components/LinkDocumentDialog", () => ({
  LinkDocumentDialog: () => <button>Link Document</button>,
}));
vi.mock("../components/ConnectionGraph", () => ({
  ConnectionGraph: () => <div data-testid="connection-graph" />,
}));

// Mock react-markdown
vi.mock("react-markdown", () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown-content" dangerouslySetInnerHTML={{ __html: children }} />
  ),
}));

vi.mock("rehype-sanitize", () => ({
  default: {},
}));

import { ItemDetailPage } from "./ItemDetailPage";

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/inventory/items/:id" element={<ItemDetailPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const baseItem = {
  id: "item-1",
  itemName: "MacBook Pro",
  brand: "Apple",
  model: "M3 Max",
  itemId: null,
  room: "Office",
  location: "Desk",
  type: "Electronics",
  condition: "Excellent",
  inUse: true,
  deductible: false,
  purchaseDate: "2025-06-15",
  warrantyExpires: null,
  replacementValue: 4500,
  resaleValue: 3000,
  purchaseTransactionId: null,
  purchasedFromId: null,
  purchasedFromName: null,
  assetId: "ASSET-001",
  notes: null,
  locationId: "loc-3",
  lastEditedTime: "2026-01-01T00:00:00Z",
};

beforeEach(() => {
  vi.clearAllMocks();

  mockItemQuery.mockReturnValue({
    data: { data: baseItem },
    isLoading: false,
    error: null,
  });

  mockConnectionsQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
  });

  mockPhotosQuery.mockReturnValue({
    data: { data: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false } },
  });

  mockLocationPathQuery.mockReturnValue({
    data: {
      data: [
        { id: "loc-1", name: "Home", parentId: null, sortOrder: 0 },
        { id: "loc-2", name: "Office", parentId: "loc-1", sortOrder: 0 },
        { id: "loc-3", name: "Desk", parentId: "loc-2", sortOrder: 0 },
      ],
    },
  });

  mockDeleteMutation.mockReturnValue({
    mutate: mockDeleteMutate,
    isPending: false,
  });

  mockDisconnectMutation.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  });

  mockUseUtils.mockReturnValue({
    inventory: {
      connections: { listForItem: { invalidate: vi.fn() } },
      documents: { listForItem: { invalidate: vi.fn() } },
    },
  });
});

describe("ItemDetailPage", () => {
  describe("metadata rendering", () => {
    it("renders item name and brand/model", () => {
      renderAtRoute("/inventory/items/item-1");
      expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
      expect(screen.getByText(/Apple/)).toBeInTheDocument();
      expect(screen.getByText(/M3 Max/)).toBeInTheDocument();
    });

    it("renders all metadata fields", () => {
      renderAtRoute("/inventory/items/item-1");
      expect(screen.getByText("Electronics")).toBeInTheDocument();
      expect(screen.getByText("Excellent")).toBeInTheDocument();
      expect(screen.getByText("Office")).toBeInTheDocument();
      expect(screen.getByText("ASSET-001")).toBeInTheDocument();
      expect(screen.getByText("In Use")).toBeInTheDocument();
      expect(screen.getByText("$4,500")).toBeInTheDocument();
    });

    it("omits null metadata fields", () => {
      mockItemQuery.mockReturnValue({
        data: {
          data: {
            ...baseItem,
            brand: null,
            model: null,
            type: null,
            condition: null,
            room: null,
            assetId: null,
            purchaseDate: null,
            replacementValue: null,
          },
        },
        isLoading: false,
        error: null,
      });
      renderAtRoute("/inventory/items/item-1");
      expect(screen.getByText("MacBook Pro")).toBeInTheDocument();
      expect(screen.queryByText("Electronics")).not.toBeInTheDocument();
      expect(screen.queryByText("Excellent")).not.toBeInTheDocument();
      expect(screen.queryByText("ASSET-001")).not.toBeInTheDocument();
    });
  });

  describe("404 page", () => {
    it("renders error for non-existent item", () => {
      mockItemQuery.mockReturnValue({
        data: null,
        isLoading: false,
        error: { message: "Not found", data: { code: "NOT_FOUND" } },
      });
      renderAtRoute("/inventory/items/nonexistent");
      expect(screen.getByText("Item not found")).toBeInTheDocument();
      expect(screen.getByText("This item doesn't exist.")).toBeInTheDocument();
      expect(screen.getByText("Back to inventory")).toBeInTheDocument();
    });
  });

  describe("delete with AlertDialog", () => {
    it("shows delete button", () => {
      renderAtRoute("/inventory/items/item-1");
      expect(screen.getByRole("button", { name: /delete/i })).toBeInTheDocument();
    });

    it("opens confirmation dialog with item name and counts", () => {
      mockConnectionsQuery.mockReturnValue({
        data: {
          data: [
            { id: "c1", itemAId: "item-1", itemBId: "item-2" },
            { id: "c2", itemAId: "item-1", itemBId: "item-3" },
          ],
        },
        isLoading: false,
      });
      mockPhotosQuery.mockReturnValue({
        data: { data: [], pagination: { total: 3, limit: 20, offset: 0, hasMore: false } },
      });

      renderAtRoute("/inventory/items/item-1");
      fireEvent.click(screen.getByRole("button", { name: /delete/i }));

      expect(screen.getByText("Delete MacBook Pro?")).toBeInTheDocument();
      expect(screen.getByText(/2 connections/)).toBeInTheDocument();
      expect(screen.getByText(/3 photos/)).toBeInTheDocument();
    });

    it("calls delete mutation on confirm", () => {
      renderAtRoute("/inventory/items/item-1");
      fireEvent.click(screen.getByRole("button", { name: /delete/i }));

      const confirmButtons = screen.getAllByRole("button", { name: /delete/i });
      const confirmButton = confirmButtons[confirmButtons.length - 1]!;
      fireEvent.click(confirmButton);

      expect(mockDeleteMutate).toHaveBeenCalledWith({ id: "item-1" });
    });

    it("closes dialog on cancel", () => {
      renderAtRoute("/inventory/items/item-1");
      fireEvent.click(screen.getByRole("button", { name: /delete/i }));
      expect(screen.getByText("Delete MacBook Pro?")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
      expect(screen.queryByText("Delete MacBook Pro?")).not.toBeInTheDocument();
    });
  });

  describe("location breadcrumb", () => {
    it("renders breadcrumb path with clickable segments", () => {
      renderAtRoute("/inventory/items/item-1");
      const breadcrumb = screen.getByTestId("location-breadcrumb");
      expect(breadcrumb).toBeInTheDocument();

      expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
        "href",
        "/inventory?location=loc-1"
      );
      expect(screen.getByRole("link", { name: "Office" })).toHaveAttribute(
        "href",
        "/inventory?location=loc-2"
      );
      expect(screen.getByRole("link", { name: "Desk" })).toHaveAttribute(
        "href",
        "/inventory?location=loc-3"
      );
    });

    it("shows 'No location assigned' when locationId is null", () => {
      mockItemQuery.mockReturnValue({
        data: { data: { ...baseItem, locationId: null } },
        isLoading: false,
        error: null,
      });
      mockLocationPathQuery.mockReturnValue({ data: null });

      renderAtRoute("/inventory/items/item-1");
      expect(screen.getByText("No location assigned")).toBeInTheDocument();
    });
  });

  describe("notes markdown rendering", () => {
    it("renders notes as markdown", () => {
      mockItemQuery.mockReturnValue({
        data: { data: { ...baseItem, notes: "**Bold** and _italic_" } },
        isLoading: false,
        error: null,
      });

      renderAtRoute("/inventory/items/item-1");
      expect(screen.getByText("Notes")).toBeInTheDocument();
      expect(screen.getByTestId("markdown-content")).toBeInTheDocument();
    });

    it("hides notes section when notes is null", () => {
      renderAtRoute("/inventory/items/item-1");
      expect(screen.queryByText("Notes")).not.toBeInTheDocument();
    });
  });

  describe("purchase link section", () => {
    it("shows transaction link when purchaseTransactionId set", () => {
      mockItemQuery.mockReturnValue({
        data: { data: { ...baseItem, purchaseTransactionId: "txn-123" } },
        isLoading: false,
        error: null,
      });

      renderAtRoute("/inventory/items/item-1");
      const link = screen.getByRole("link", { name: /view transaction/i });
      expect(link).toHaveAttribute("href", "/finance/transactions/txn-123");
    });

    it("shows entity name when purchasedFromId set", () => {
      mockItemQuery.mockReturnValue({
        data: { data: { ...baseItem, purchasedFromId: "entity-1", purchasedFromName: "JB Hi-Fi" } },
        isLoading: false,
        error: null,
      });

      renderAtRoute("/inventory/items/item-1");
      expect(screen.getByText("JB Hi-Fi")).toBeInTheDocument();
    });

    it("hides section when both fields are null", () => {
      renderAtRoute("/inventory/items/item-1");
      expect(screen.queryByTestId("purchase-link-section")).not.toBeInTheDocument();
    });

    it("shows both transaction link and entity name", () => {
      mockItemQuery.mockReturnValue({
        data: {
          data: {
            ...baseItem,
            purchaseTransactionId: "txn-123",
            purchasedFromId: "entity-1",
            purchasedFromName: "Apple Store",
          },
        },
        isLoading: false,
        error: null,
      });

      renderAtRoute("/inventory/items/item-1");
      expect(screen.getByRole("link", { name: /view transaction/i })).toBeInTheDocument();
      expect(screen.getByText("Apple Store")).toBeInTheDocument();
    });
  });
});
