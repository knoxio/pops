import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { extractPrefix } from "./ItemFormPage";

// ---------- prefix extraction tests (pure function) ----------

describe("extractPrefix", () => {
  it("extracts prefix from single-word type", () => {
    expect(extractPrefix("Electronics")).toBe("ELECTRONICS".slice(0, 4));
  });

  it("handles short types (≤6 chars)", () => {
    expect(extractPrefix("Tools")).toBe("TOOLS");
    expect(extractPrefix("Office")).toBe("OFFICE");
  });

  it("takes first word of multi-word type", () => {
    expect(extractPrefix("HDMI Cable")).toBe("HDMI");
  });

  it("truncates long first words to 4 characters", () => {
    expect(extractPrefix("Electronics")).toBe("ELEC");
    expect(extractPrefix("Furniture")).toBe("FURN");
    expect(extractPrefix("Appliance")).toBe("APPL");
  });

  it("uppercases the prefix", () => {
    expect(extractPrefix("kitchen")).toBe("KITC");
  });

  it("keeps 5-6 char words intact", () => {
    expect(extractPrefix("Sport")).toBe("SPORT");
    expect(extractPrefix("Camera")).toBe("CAMERA");
  });
});

// ---------- zero-padding format tests ----------

describe("zero-padding format", () => {
  it("pads single digit to 2 digits", () => {
    const num = 1;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, "0");
    expect(padded).toBe("01");
  });

  it("pads double digit to 2 digits", () => {
    const num = 42;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, "0");
    expect(padded).toBe("42");
  });

  it("uses 3 digits for 100+", () => {
    const num = 100;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, "0");
    expect(padded).toBe("100");
  });

  it("uses 3 digits for larger numbers", () => {
    const num = 256;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, "0");
    expect(padded).toBe("256");
  });
});

// ---------- component tests ----------

const mockItemQuery = vi.fn();
const mockListQuery = vi.fn();
const mockSearchByAssetIdFetch = vi.fn();
const mockCountByAssetPrefixFetch = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockConnectMutate = vi.fn();
const mockPhotosListQuery = vi.fn();
const mockAttachMutate = vi.fn();
const mockRemoveMutate = vi.fn();
const mockReorderMutate = vi.fn();
const mockRefetchPhotos = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    inventory: {
      items: {
        get: { useQuery: (...args: unknown[]) => mockItemQuery(...args) },
        list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
        create: {
          useMutation: (opts: Record<string, unknown>) => ({
            mutate: (...args: unknown[]) => {
              mockCreateMutate(...args);
              if (typeof opts.onSuccess === "function")
                (opts.onSuccess as (...args: unknown[]) => void)({ data: { id: "new-id" } });
            },
            isPending: false,
          }),
        },
        update: {
          useMutation: (opts: Record<string, unknown>) => ({
            mutate: (...args: unknown[]) => {
              mockUpdateMutate(...args);
              if (typeof opts.onSuccess === "function")
                (opts.onSuccess as (...args: unknown[]) => void)();
            },
            isPending: false,
          }),
        },
      },
      connections: {
        connect: {
          useMutation: () => ({ mutateAsync: mockConnectMutate }),
        },
      },
      photos: {
        listForItem: {
          useQuery: (...args: unknown[]) => {
            const result = mockPhotosListQuery(...args);
            return { ...result, refetch: mockRefetchPhotos };
          },
        },
        attach: {
          useMutation: (opts?: Record<string, unknown>) => ({
            mutateAsync: mockAttachMutate,
            isPending: false,
            ...(opts || {}),
          }),
        },
        remove: {
          useMutation: (opts?: Record<string, unknown>) => ({
            mutate: (...args: unknown[]) => {
              mockRemoveMutate(...args);
              if (typeof opts?.onSuccess === "function")
                (opts.onSuccess as (...args: unknown[]) => void)();
            },
            isPending: false,
          }),
        },
        reorder: {
          useMutation: () => ({ mutate: mockReorderMutate, isPending: false }),
        },
      },
    },
    useUtils: () => ({
      inventory: {
        items: {
          list: { invalidate: vi.fn() },
          get: { invalidate: vi.fn() },
          searchByAssetId: { fetch: mockSearchByAssetIdFetch },
          countByAssetPrefix: { fetch: mockCountByAssetPrefixFetch },
        },
      },
    }),
  },
}));

// Mock useImageProcessor
vi.mock("../hooks/useImageProcessor", () => ({
  useImageProcessor: () => ({
    processFiles: vi.fn(async (files: File[]) =>
      files.map((f) => ({
        original: f,
        processed: new Blob([new Uint8Array(100)], { type: "image/jpeg" }),
        previewUrl: "blob:mock-preview",
        originalSize: f.size,
        processedSize: 100,
      }))
    ),
    processing: false,
  }),
}));

import { ItemFormPage } from "./ItemFormPage";

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={["/inventory/items/new"]}>
      <Routes>
        <Route path="/inventory/items/new" element={<ItemFormPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderEdit(id: string) {
  return render(
    <MemoryRouter initialEntries={[`/inventory/items/${id}/edit`]}>
      <Routes>
        <Route path="/inventory/items/:id/edit" element={<ItemFormPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  mockItemQuery.mockReturnValue({
    data: null,
    isLoading: false,
    error: null,
  });

  mockListQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
  });

  mockSearchByAssetIdFetch.mockResolvedValue({ data: null });
  mockCountByAssetPrefixFetch.mockResolvedValue({ data: 0 });

  mockPhotosListQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
  });
});

describe("ItemFormPage — Asset ID generation", () => {
  it("renders auto-generate button", () => {
    renderCreate();
    expect(screen.getByRole("button", { name: /auto-generate/i })).toBeInTheDocument();
  });

  it("disables auto-generate when type is empty", () => {
    renderCreate();
    const btn = screen.getByRole("button", { name: /auto-generate/i });
    expect(btn).toBeDisabled();
  });

  it("enables auto-generate when type is selected", () => {
    renderCreate();
    const typeSelect = screen.getByRole("combobox", { name: /type/i });
    fireEvent.change(typeSelect, { target: { value: "Electronics" } });
    const btn = screen.getByRole("button", { name: /auto-generate/i });
    expect(btn).not.toBeDisabled();
  });

  it("shows asset ID uniqueness error on blur when taken", async () => {
    mockSearchByAssetIdFetch.mockResolvedValue({
      data: { id: "other-item", itemName: "Existing Item" },
    });

    renderCreate();
    const assetInput = screen.getByRole("textbox", { name: /asset id/i });
    fireEvent.change(assetInput, { target: { value: "ELEC01" } });
    fireEvent.blur(assetInput);

    // Wait for async validation
    await vi.waitFor(() => {
      expect(screen.getByText(/Asset ID already in use by Existing Item/)).toBeInTheDocument();
    });
  });

  it("skips uniqueness error for own asset ID in edit mode", async () => {
    mockItemQuery.mockReturnValue({
      data: {
        data: {
          id: "item-1",
          itemName: "MacBook",
          brand: null,
          model: null,
          itemId: null,
          type: "Electronics",
          condition: "Good",
          room: null,
          inUse: false,
          deductible: false,
          purchaseDate: null,
          warrantyExpires: null,
          replacementValue: null,
          resaleValue: null,
          assetId: "ELEC01",
          notes: null,
          locationId: null,
          lastEditedTime: "2026-01-01",
          purchaseTransactionId: null,
          purchasedFromId: null,
          purchasedFromName: null,
        },
      },
      isLoading: false,
      error: null,
    });

    mockSearchByAssetIdFetch.mockResolvedValue({
      data: { id: "item-1", itemName: "MacBook" },
    });

    renderEdit("item-1");

    const assetInput = screen.getByDisplayValue("ELEC01");
    fireEvent.blur(assetInput);

    await vi.waitFor(() => {
      expect(mockSearchByAssetIdFetch).toHaveBeenCalledWith({ assetId: "ELEC01" });
    });
    expect(screen.queryByText(/Asset ID already in use/)).not.toBeInTheDocument();
  });

  it("skips uniqueness check when asset ID is empty", () => {
    renderCreate();
    const assetInput = screen.getByRole("textbox", { name: /asset id/i });
    fireEvent.blur(assetInput);
    expect(mockSearchByAssetIdFetch).not.toHaveBeenCalled();
  });
});

describe("ItemFormPage — Photos section", () => {
  it("renders Photos section heading", () => {
    renderCreate();
    expect(screen.getByText("Photos")).toBeInTheDocument();
  });

  it("renders PhotoUpload component with upload zone", () => {
    renderCreate();
    expect(screen.getByRole("button", { name: /upload photos/i })).toBeInTheDocument();
  });

  it("renders existing photos in edit mode", () => {
    mockItemQuery.mockReturnValue({
      data: {
        data: {
          id: "item-1",
          itemName: "Camera",
          brand: null,
          model: null,
          itemId: null,
          type: null,
          condition: null,
          room: null,
          inUse: false,
          deductible: false,
          purchaseDate: null,
          warrantyExpires: null,
          replacementValue: null,
          resaleValue: null,
          assetId: null,
          notes: null,
          locationId: null,
          lastEditedTime: "2026-01-01",
          purchasedFromId: null,
          purchasedFromName: null,
          purchaseTransactionId: null,
        },
      },
      isLoading: false,
      error: null,
    });

    mockPhotosListQuery.mockReturnValue({
      data: {
        data: [
          { id: 1, filePath: "photo1.jpg", caption: "Front view", sortOrder: 0 },
          { id: 2, filePath: "photo2.jpg", caption: "Back view", sortOrder: 1 },
        ],
      },
      isLoading: false,
    });

    renderEdit("item-1");

    expect(screen.getByAltText("Front view")).toBeInTheDocument();
    expect(screen.getByAltText("Back view")).toBeInTheDocument();
  });

  it("shows delete confirmation when delete button is clicked", () => {
    mockItemQuery.mockReturnValue({
      data: {
        data: {
          id: "item-1",
          itemName: "Camera",
          brand: null,
          model: null,
          itemId: null,
          type: null,
          condition: null,
          room: null,
          inUse: false,
          deductible: false,
          purchaseDate: null,
          warrantyExpires: null,
          replacementValue: null,
          resaleValue: null,
          assetId: null,
          notes: null,
          locationId: null,
          lastEditedTime: "2026-01-01",
          purchasedFromId: null,
          purchasedFromName: null,
          purchaseTransactionId: null,
        },
      },
      isLoading: false,
      error: null,
    });

    mockPhotosListQuery.mockReturnValue({
      data: {
        data: [{ id: 1, filePath: "photo1.jpg", caption: "Front", sortOrder: 0 }],
      },
      isLoading: false,
    });

    renderEdit("item-1");

    fireEvent.click(screen.getByLabelText(/delete photo front/i));
    expect(screen.getByText(/delete this photo/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^delete$/i })).toBeInTheDocument();
  });

  it("dismisses delete confirmation on cancel", () => {
    mockItemQuery.mockReturnValue({
      data: {
        data: {
          id: "item-1",
          itemName: "Camera",
          brand: null,
          model: null,
          itemId: null,
          type: null,
          condition: null,
          room: null,
          inUse: false,
          deductible: false,
          purchaseDate: null,
          warrantyExpires: null,
          replacementValue: null,
          resaleValue: null,
          assetId: null,
          notes: null,
          locationId: null,
          lastEditedTime: "2026-01-01",
          purchasedFromId: null,
          purchasedFromName: null,
          purchaseTransactionId: null,
        },
      },
      isLoading: false,
      error: null,
    });

    mockPhotosListQuery.mockReturnValue({
      data: {
        data: [{ id: 1, filePath: "photo1.jpg", caption: "Front", sortOrder: 0 }],
      },
      isLoading: false,
    });

    renderEdit("item-1");

    fireEvent.click(screen.getByLabelText(/delete photo front/i));
    expect(screen.getByText(/delete this photo/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(screen.queryByText(/delete this photo/i)).not.toBeInTheDocument();
  });

  it("renders camera button for mobile photo capture", () => {
    renderCreate();
    expect(screen.getByRole("button", { name: /take photo/i })).toBeInTheDocument();
  });
});
