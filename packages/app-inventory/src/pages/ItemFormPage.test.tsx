import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

const mockGetQuery = vi.fn();
const mockListQuery = vi.fn();
const mockSearchByAssetIdFetch = vi.fn();
const mockCountByAssetPrefixFetch = vi.fn();
const mockCreateMutate = vi.fn();
const mockUpdateMutate = vi.fn();
const mockConnectMutateAsync = vi.fn();
const mockInvalidateList = vi.fn();
const mockInvalidateGet = vi.fn();

vi.mock("../lib/trpc", () => ({
  trpc: {
    inventory: {
      items: {
        get: { useQuery: (...args: unknown[]) => mockGetQuery(...args) },
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
          useMutation: () => ({ mutateAsync: mockConnectMutateAsync }),
        },
      },
    },
    useUtils: () => ({
      inventory: {
        items: {
          list: { invalidate: mockInvalidateList },
          get: { invalidate: mockInvalidateGet },
          searchByAssetId: { fetch: mockSearchByAssetIdFetch },
          countByAssetPrefix: { fetch: mockCountByAssetPrefixFetch },
        },
      },
    }),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import { ItemFormPage } from "./ItemFormPage";
import { toast } from "sonner";

const MOCK_ITEM = {
  id: "item-1",
  itemName: "MacBook Pro",
  brand: "Apple",
  model: "M3 Max",
  itemId: "SKU-123",
  room: "Office",
  location: null,
  type: "Electronics",
  condition: "Good",
  inUse: true,
  deductible: false,
  purchaseDate: "2024-06-15",
  warrantyExpires: "2027-06-15",
  purchasePrice: 4299.0,
  replacementValue: 4299.0,
  resaleValue: 3000.0,
  purchaseTransactionId: null,
  purchasedFromId: null,
  purchasedFromName: null,
  assetId: "ASSET-001",
  notes: "16-inch, 64GB RAM",
  locationId: null,
  lastEditedTime: "2024-06-15T00:00:00Z",
};

function setupCreateMode() {
  mockGetQuery.mockReturnValue({ data: undefined, isLoading: false, error: null });
  mockListQuery.mockReturnValue({ data: undefined, isLoading: false });
}

function setupEditMode(item = MOCK_ITEM) {
  mockGetQuery.mockReturnValue({
    data: { data: item },
    isLoading: false,
    error: null,
  });
  mockListQuery.mockReturnValue({ data: undefined, isLoading: false });
}

function setupLoading() {
  mockGetQuery.mockReturnValue({ data: undefined, isLoading: true, error: null });
  mockListQuery.mockReturnValue({ data: undefined, isLoading: false });
}

function setup404() {
  mockGetQuery.mockReturnValue({
    data: undefined,
    isLoading: false,
    error: { message: "Not found", data: { code: "NOT_FOUND" } },
  });
  mockListQuery.mockReturnValue({ data: undefined, isLoading: false });
}

function renderCreatePage() {
  return render(
    <MemoryRouter initialEntries={["/inventory/items/new"]}>
      <Routes>
        <Route path="/inventory/items/new" element={<ItemFormPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderEditPage(id = "item-1") {
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
  mockSearchByAssetIdFetch.mockResolvedValue({ data: null });
  mockCountByAssetPrefixFetch.mockResolvedValue({ data: 0 });
});

describe("ItemFormPage — Asset ID generation", () => {
  it("renders auto-generate button", () => {
    setupCreateMode();
    renderCreatePage();
    expect(screen.getByRole("button", { name: /auto-generate/i })).toBeInTheDocument();
  });

  it("disables auto-generate when type is empty", () => {
    setupCreateMode();
    renderCreatePage();
    const btn = screen.getByRole("button", { name: /auto-generate/i });
    expect(btn).toBeDisabled();
  });

  it("enables auto-generate when type is selected", () => {
    setupCreateMode();
    renderCreatePage();
    const typeSelect = document.querySelector<HTMLSelectElement>("select[name='type']")!;
    fireEvent.change(typeSelect, { target: { value: "Electronics" } });
    const btn = screen.getByRole("button", { name: /auto-generate/i });
    expect(btn).not.toBeDisabled();
  });

  it("shows asset ID uniqueness error on blur when taken", async () => {
    mockSearchByAssetIdFetch.mockResolvedValue({
      data: { id: "other-item", itemName: "Existing Item" },
    });

    setupCreateMode();
    renderCreatePage();
    const assetInput = document.querySelector<HTMLInputElement>("input[name='assetId']")!;
    fireEvent.change(assetInput, { target: { value: "ELEC01" } });
    fireEvent.blur(assetInput);

    // Wait for async validation
    await vi.waitFor(() => {
      expect(screen.getByText(/Asset ID already in use by Existing Item/)).toBeInTheDocument();
    });
  });

  it("skips uniqueness error for own asset ID in edit mode", async () => {
    setupEditMode({
      ...MOCK_ITEM,
      assetId: "ELEC01",
    });

    mockSearchByAssetIdFetch.mockResolvedValue({
      data: { id: "item-1", itemName: "MacBook Pro" },
    });

    renderEditPage("item-1");

    const assetInput = screen.getByDisplayValue("ELEC01");
    fireEvent.blur(assetInput);

    await vi.waitFor(() => {
      expect(mockSearchByAssetIdFetch).toHaveBeenCalledWith({ assetId: "ELEC01" });
    });
    expect(screen.queryByText(/Asset ID already in use/)).not.toBeInTheDocument();
  });

  it("skips uniqueness check when asset ID is empty", () => {
    setupCreateMode();
    renderCreatePage();
    const assetInput = document.querySelector<HTMLInputElement>("input[name='assetId']")!;
    fireEvent.blur(assetInput);
    expect(mockSearchByAssetIdFetch).not.toHaveBeenCalled();
  });
});

describe("ItemFormPage", () => {
  describe("create mode — empty form", () => {
    it("renders 'New Item' heading", () => {
      setupCreateMode();
      renderCreatePage();
      expect(screen.getByRole("heading", { name: "New Item" })).toBeInTheDocument();
    });

    it("has empty name field", () => {
      setupCreateMode();
      renderCreatePage();
      const nameInput = screen.getByPlaceholderText("e.g. MacBook Pro 16-inch");
      expect(nameInput).toHaveValue("");
    });

    it("defaults condition to 'Good'", () => {
      setupCreateMode();
      renderCreatePage();
      const conditionSelect = document.querySelector<HTMLSelectElement>(
        "select[name='condition']"
      )!;
      expect(conditionSelect).toHaveValue("Good");
    });

    it("shows correct condition options", () => {
      setupCreateMode();
      renderCreatePage();
      const conditionSelect = document.querySelector<HTMLSelectElement>(
        "select[name='condition']"
      )!;
      const options = Array.from(conditionSelect.querySelectorAll("option")).map(
        (o) => o.textContent
      );
      expect(options).toContain("New");
      expect(options).toContain("Excellent");
      expect(options).toContain("Good");
      expect(options).toContain("Fair");
      expect(options).toContain("Poor");
      expect(options).toContain("Broken");
    });

    it("has purchase price field", () => {
      setupCreateMode();
      renderCreatePage();
      expect(screen.getByText("Purchase Price ($)")).toBeInTheDocument();
    });

    it("shows Type as required field", () => {
      setupCreateMode();
      renderCreatePage();
      expect(screen.getByText("Type *")).toBeInTheDocument();
    });
  });

  describe("edit mode — pre-population", () => {
    it("renders 'Edit Item' heading", () => {
      setupEditMode();
      renderEditPage();
      expect(screen.getByText("Edit Item")).toBeInTheDocument();
    });

    it("populates name from item data", () => {
      setupEditMode();
      renderEditPage();
      const nameInput = screen.getByPlaceholderText("e.g. MacBook Pro 16-inch");
      expect(nameInput).toHaveValue("MacBook Pro");
    });

    it("populates brand and model", () => {
      setupEditMode();
      renderEditPage();
      expect(screen.getByPlaceholderText("e.g. Apple")).toHaveValue("Apple");
      expect(screen.getByPlaceholderText("e.g. M3 Max")).toHaveValue("M3 Max");
    });

    it("populates condition from item data", () => {
      setupEditMode();
      renderEditPage();
      const conditionSelect = document.querySelector<HTMLSelectElement>(
        "select[name='condition']"
      )!;
      expect(conditionSelect).toHaveValue("Good");
    });

    it("populates purchase price", () => {
      setupEditMode();
      renderEditPage();
      const priceInputs = screen.getAllByPlaceholderText("0.00");
      expect(priceInputs[0]).toHaveValue(4299);
    });
  });

  describe("required field validation", () => {
    it("shows error when submitting without item name", async () => {
      setupCreateMode();
      const user = userEvent.setup();
      renderCreatePage();

      const typeSelect = document.querySelector<HTMLSelectElement>("select[name='type']")!;
      await user.selectOptions(typeSelect, "Electronics");

      const submitBtn = screen.getByRole("button", { name: /create item/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("Item name is required")).toBeInTheDocument();
      });
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });

    it("shows error when submitting without type", async () => {
      setupCreateMode();
      const user = userEvent.setup();
      renderCreatePage();

      const nameInput = screen.getByPlaceholderText("e.g. MacBook Pro 16-inch");
      await user.type(nameInput, "Test Item");

      const submitBtn = screen.getByRole("button", { name: /create item/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText("Type is required")).toBeInTheDocument();
      });
      expect(mockCreateMutate).not.toHaveBeenCalled();
    });
  });

  describe("currency validation", () => {
    it("purchase price accepts decimal values", async () => {
      setupCreateMode();
      const user = userEvent.setup();
      renderCreatePage();

      const priceInputs = screen.getAllByPlaceholderText("0.00");
      await user.type(priceInputs[0]!, "199.99");
      expect(priceInputs[0]).toHaveValue(199.99);
    });

    it("replacement value has min=0", () => {
      setupCreateMode();
      renderCreatePage();
      const priceInputs = screen.getAllByPlaceholderText("0.00");
      expect(priceInputs[1]).toHaveAttribute("min", "0");
    });
  });

  describe("submit create", () => {
    it("calls create mutation with form data", async () => {
      setupCreateMode();
      const user = userEvent.setup();
      renderCreatePage();

      await user.type(screen.getByPlaceholderText("e.g. MacBook Pro 16-inch"), "New Laptop");
      await user.selectOptions(
        document.querySelector<HTMLSelectElement>("select[name='type']")!,
        "Electronics"
      );

      const submitBtn = screen.getByRole("button", { name: /create item/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockCreateMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            itemName: "New Laptop",
            type: "Electronics",
            condition: "Good",
          })
        );
      });
    });
  });

  describe("submit update", () => {
    it("calls update mutation with item id and data", async () => {
      setupEditMode();
      const user = userEvent.setup();
      renderEditPage();

      const nameInput = screen.getByPlaceholderText("e.g. MacBook Pro 16-inch");
      await user.clear(nameInput);
      await user.type(nameInput, "MacBook Pro Updated");

      const submitBtn = screen.getByRole("button", { name: /save changes/i });
      await user.click(submitBtn);

      await waitFor(() => {
        expect(mockUpdateMutate).toHaveBeenCalledWith(
          expect.objectContaining({
            id: "item-1",
            data: expect.objectContaining({
              itemName: "MacBook Pro Updated",
            }),
          })
        );
      });
    });
  });

  describe("notes preview", () => {
    it("toggles between edit and preview mode", async () => {
      setupCreateMode();
      const user = userEvent.setup();
      renderCreatePage();

      expect(screen.getByPlaceholderText("Add notes about this item...")).toBeInTheDocument();

      await user.click(screen.getByLabelText("Preview notes"));
      expect(screen.getByLabelText("Notes preview")).toBeInTheDocument();

      await user.click(screen.getByLabelText("Edit notes"));
      expect(screen.getByPlaceholderText("Add notes about this item...")).toBeInTheDocument();
    });
  });

  describe("error states", () => {
    it("shows 404 for invalid edit ID", () => {
      setup404();
      renderEditPage("invalid-id");
      expect(screen.getByText("Item not found")).toBeInTheDocument();
      expect(screen.getByText("This item doesn't exist.")).toBeInTheDocument();
    });

    it("shows loading skeleton", () => {
      setupLoading();
      const { container } = renderEditPage();
      const skeletons = container.querySelectorAll("[data-slot='skeleton']");
      expect(skeletons.length).toBeGreaterThan(0);
    });
  });

  describe("unsaved changes warning", () => {
    it("adds beforeunload handler when form is dirty", async () => {
      setupCreateMode();
      const user = userEvent.setup();
      const addSpy = vi.spyOn(window, "addEventListener");
      renderCreatePage();

      await user.type(screen.getByPlaceholderText("e.g. MacBook Pro 16-inch"), "Test");

      await waitFor(() => {
        expect(addSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
      });

      addSpy.mockRestore();
    });
  });
});
