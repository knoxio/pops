import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractPrefix } from './ItemFormPage';

const mockNavigate = vi.fn();

vi.mock('react-router', async () => {
  const actual = await vi.importActual<typeof import('react-router')>('react-router');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

// ---------- prefix extraction tests (pure function) ----------

describe('extractPrefix', () => {
  it('extracts prefix from single-word type', () => {
    expect(extractPrefix('Electronics')).toBe('ELECTRONICS'.slice(0, 4));
  });

  it('handles short types (≤6 chars)', () => {
    expect(extractPrefix('Tools')).toBe('TOOLS');
    expect(extractPrefix('Office')).toBe('OFFICE');
  });

  it('takes first word of multi-word type', () => {
    expect(extractPrefix('HDMI Cable')).toBe('HDMI');
  });

  it('truncates long first words to 4 characters', () => {
    expect(extractPrefix('Electronics')).toBe('ELEC');
    expect(extractPrefix('Furniture')).toBe('FURN');
    expect(extractPrefix('Appliance')).toBe('APPL');
  });

  it('uppercases the prefix', () => {
    expect(extractPrefix('kitchen')).toBe('KITC');
  });

  it('keeps 5-6 char words intact', () => {
    expect(extractPrefix('Sport')).toBe('SPORT');
    expect(extractPrefix('Camera')).toBe('CAMERA');
  });
});

// ---------- zero-padding format tests ----------

describe('zero-padding format', () => {
  it('pads single digit to 2 digits', () => {
    const num = 1;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, '0');
    expect(padded).toBe('01');
  });

  it('pads double digit to 2 digits', () => {
    const num = 42;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, '0');
    expect(padded).toBe('42');
  });

  it('uses 3 digits for 100+', () => {
    const num = 100;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, '0');
    expect(padded).toBe('100');
  });

  it('uses 3 digits for larger numbers', () => {
    const num = 256;
    const padded = num >= 100 ? String(num) : String(num).padStart(2, '0');
    expect(padded).toBe('256');
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
const mockListInvalidate = vi.fn();
const mockGetInvalidate = vi.fn();

vi.mock('@pops/api-client', () => ({
  trpc: {
    inventory: {
      items: {
        get: { useQuery: (...args: unknown[]) => mockItemQuery(...args) },
        list: { useQuery: (...args: unknown[]) => mockListQuery(...args) },
        create: {
          useMutation: (opts: Record<string, unknown>) => ({
            mutate: (...args: unknown[]) => {
              mockCreateMutate(...args);
              if (typeof opts.onSuccess === 'function')
                (opts.onSuccess as (...args: unknown[]) => void)({ data: { id: 'new-id' } });
            },
            isPending: false,
          }),
        },
        update: {
          useMutation: (opts: Record<string, unknown>) => ({
            mutate: (...args: unknown[]) => {
              mockUpdateMutate(...args);
              if (typeof opts.onSuccess === 'function')
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
      locations: {
        tree: { useQuery: () => ({ data: { data: [] } }) },
        create: {
          useMutation: (opts?: Record<string, unknown>) => ({
            mutate: vi.fn(),
            isPending: false,
            ...opts,
          }),
        },
      },
      photos: {
        listForItem: {
          useQuery: (...args: unknown[]) => {
            const result = mockPhotosListQuery(...args);
            return { ...result, refetch: mockRefetchPhotos };
          },
        },
        upload: {
          useMutation: (opts?: Record<string, unknown>) => ({
            mutateAsync: mockAttachMutate,
            isPending: false,
            ...opts,
          }),
        },
        remove: {
          useMutation: (opts?: Record<string, unknown>) => ({
            mutate: (...args: unknown[]) => {
              mockRemoveMutate(...args);
              if (typeof opts?.onSuccess === 'function')
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
          list: { invalidate: mockListInvalidate },
          get: { invalidate: mockGetInvalidate },
          searchByAssetId: { fetch: mockSearchByAssetIdFetch },
          countByAssetPrefix: { fetch: mockCountByAssetPrefixFetch },
        },
        locations: {
          tree: { invalidate: vi.fn() },
        },
      },
    }),
  },
}));

// Mock react-markdown
vi.mock('react-markdown', () => ({
  default: ({ children }: { children: string }) => (
    <div data-testid="markdown-preview">{children}</div>
  ),
}));

vi.mock('rehype-sanitize', () => ({
  default: {},
}));

// Mock useImageProcessor
vi.mock('../hooks/useImageProcessor', () => ({
  useImageProcessor: () => ({
    processFiles: vi.fn(async (files: File[]) =>
      files.map((f) => ({
        original: f,
        processed: new Blob([new Uint8Array(100)], { type: 'image/jpeg' }),
        previewUrl: 'blob:mock-preview',
        originalSize: f.size,
        processedSize: 100,
      }))
    ),
    processing: false,
  }),
}));

import { ItemFormPage } from './ItemFormPage';

function renderCreate() {
  return render(
    <MemoryRouter initialEntries={['/inventory/items/new']}>
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

describe('ItemFormPage — Asset ID generation', () => {
  it('renders auto-generate button', () => {
    renderCreate();
    expect(screen.getByRole('button', { name: /auto-generate/i })).toBeInTheDocument();
  });

  it('disables auto-generate when type is empty', () => {
    renderCreate();
    const btn = screen.getByRole('button', { name: /auto-generate/i });
    expect(btn).toBeDisabled();
  });

  it('enables auto-generate when type is selected', () => {
    renderCreate();
    const typeSelect = document.querySelector('select[name="type"]') as HTMLSelectElement;
    expect(typeSelect).toBeInTheDocument();
    fireEvent.change(typeSelect, { target: { value: 'Electronics' } });
    const btn = screen.getByRole('button', { name: /auto-generate/i });
    expect(btn).not.toBeDisabled();
  });

  it('shows asset ID uniqueness error on blur when taken', async () => {
    mockSearchByAssetIdFetch.mockResolvedValue({
      data: { id: 'other-item', itemName: 'Existing Item' },
    });

    renderCreate();
    const assetInput = document.querySelector('input[name="assetId"]') as HTMLInputElement;
    expect(assetInput).toBeInTheDocument();
    fireEvent.change(assetInput, { target: { value: 'ELEC01' } });
    fireEvent.blur(assetInput);

    // Wait for async validation
    await vi.waitFor(() => {
      expect(screen.getByText(/Asset ID already in use by Existing Item/)).toBeInTheDocument();
    });
  });

  it('skips uniqueness error for own asset ID in edit mode', async () => {
    mockItemQuery.mockReturnValue({
      data: {
        data: {
          id: 'item-1',
          itemName: 'MacBook',
          brand: null,
          model: null,
          itemId: null,
          type: 'Electronics',
          condition: 'Good',
          room: null,
          inUse: false,
          deductible: false,
          purchaseDate: null,
          warrantyExpires: null,
          replacementValue: null,
          resaleValue: null,
          purchasePrice: null,
          assetId: 'ELEC01',
          notes: null,
          locationId: null,
          lastEditedTime: '2026-01-01',
          purchaseTransactionId: null,
          purchasedFromId: null,
          purchasedFromName: null,
        },
      },
      isLoading: false,
      error: null,
    });

    mockSearchByAssetIdFetch.mockResolvedValue({
      data: { id: 'item-1', itemName: 'MacBook' },
    });

    renderEdit('item-1');

    const assetInput = screen.getByDisplayValue('ELEC01');
    fireEvent.blur(assetInput);

    await vi.waitFor(() => {
      expect(mockSearchByAssetIdFetch).toHaveBeenCalledWith({ assetId: 'ELEC01' });
    });
    expect(screen.queryByText(/Asset ID already in use/)).not.toBeInTheDocument();
  });

  it('skips uniqueness check when asset ID is empty', () => {
    renderCreate();
    const assetInput = document.querySelector('input[name="assetId"]') as HTMLInputElement;
    expect(assetInput).toBeInTheDocument();
    fireEvent.blur(assetInput);
    expect(mockSearchByAssetIdFetch).not.toHaveBeenCalled();
  });
});

describe('ItemFormPage — Photos section', () => {
  it('renders Photos section heading', () => {
    renderCreate();
    expect(screen.getByText('Photos')).toBeInTheDocument();
  });

  it('renders PhotoUpload component with upload zone', () => {
    renderCreate();
    expect(screen.getByRole('button', { name: /upload photos/i })).toBeInTheDocument();
  });

  it('renders existing photos in edit mode', () => {
    mockItemQuery.mockReturnValue({
      data: {
        data: {
          id: 'item-1',
          itemName: 'Camera',
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
          purchasePrice: null,
          assetId: null,
          notes: null,
          locationId: null,
          lastEditedTime: '2026-01-01',
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
          { id: 1, filePath: 'photo1.jpg', caption: 'Front view', sortOrder: 0 },
          { id: 2, filePath: 'photo2.jpg', caption: 'Back view', sortOrder: 1 },
        ],
      },
      isLoading: false,
    });

    renderEdit('item-1');

    expect(screen.getByAltText('Front view')).toBeInTheDocument();
    expect(screen.getByAltText('Back view')).toBeInTheDocument();
  });

  it('shows delete confirmation when delete button is clicked', () => {
    mockItemQuery.mockReturnValue({
      data: {
        data: {
          id: 'item-1',
          itemName: 'Camera',
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
          purchasePrice: null,
          assetId: null,
          notes: null,
          locationId: null,
          lastEditedTime: '2026-01-01',
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
        data: [{ id: 1, filePath: 'photo1.jpg', caption: 'Front', sortOrder: 0 }],
      },
      isLoading: false,
    });

    renderEdit('item-1');

    fireEvent.click(screen.getByLabelText(/delete photo front/i));
    const confirmText = screen.getByText(/delete this photo/i);
    expect(confirmText).toBeInTheDocument();
    // Scope to the confirmation bar to avoid matching the form-level Cancel button
    const confirmBar = confirmText.closest('div')!;
    const confirmScope = within(confirmBar);
    expect(confirmScope.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(confirmScope.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('dismisses delete confirmation on cancel', () => {
    mockItemQuery.mockReturnValue({
      data: {
        data: {
          id: 'item-1',
          itemName: 'Camera',
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
          purchasePrice: null,
          assetId: null,
          notes: null,
          locationId: null,
          lastEditedTime: '2026-01-01',
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
        data: [{ id: 1, filePath: 'photo1.jpg', caption: 'Front', sortOrder: 0 }],
      },
      isLoading: false,
    });

    renderEdit('item-1');

    fireEvent.click(screen.getByLabelText(/delete photo front/i));
    const confirmText = screen.getByText(/delete this photo/i);
    expect(confirmText).toBeInTheDocument();

    // Scope to the confirmation bar to avoid matching the form-level Cancel button
    const confirmBar = confirmText.closest('div')!;
    fireEvent.click(within(confirmBar).getByRole('button', { name: /cancel/i }));
    expect(screen.queryByText(/delete this photo/i)).not.toBeInTheDocument();
  });

  it('renders camera button for mobile photo capture', () => {
    renderCreate();
    expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument();
  });
});

describe('ItemFormPage — Form gaps (#1851)', () => {
  it('renders Purchase Price field in Dates & Values section', () => {
    renderCreate();
    expect(screen.getByText(/purchase price/i)).toBeInTheDocument();
    // The input is rendered via TextInput with register("purchasePrice")
    const input = document.querySelector('input[name="purchasePrice"]');
    expect(input).toBeInTheDocument();
  });

  it('includes purchasePrice in the create payload when set', async () => {
    renderCreate();
    const nameInput = document.querySelector('input[name="itemName"]') as HTMLInputElement;
    const typeSelect = document.querySelector('select[name="type"]') as HTMLSelectElement;
    const priceInput = document.querySelector('input[name="purchasePrice"]') as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: 'Test Item' } });
    fireEvent.change(typeSelect, { target: { value: 'Electronics' } });
    fireEvent.change(priceInput, { target: { value: '149.99' } });

    fireEvent.click(screen.getByRole('button', { name: /create item/i }));

    await vi.waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({ purchasePrice: 149.99 })
      );
    });
  });

  it('sends null purchasePrice when field is empty', async () => {
    renderCreate();
    const nameInput = document.querySelector('input[name="itemName"]') as HTMLInputElement;
    const typeSelect = document.querySelector('select[name="type"]') as HTMLSelectElement;
    fireEvent.change(nameInput, { target: { value: 'Test Item' } });
    fireEvent.change(typeSelect, { target: { value: 'Electronics' } });

    fireEvent.click(screen.getByRole('button', { name: /create item/i }));

    await vi.waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({ purchasePrice: null })
      );
    });
  });

  it("defaults condition to 'good' in create mode", () => {
    renderCreate();
    const conditionSelect = document.querySelector('select[name="condition"]') as HTMLSelectElement;
    expect(conditionSelect).toBeInTheDocument();
    expect(conditionSelect.value).toBe('good');
  });

  it('renders correct condition options (new/good/fair/poor/broken)', () => {
    renderCreate();
    const conditionSelect = document.querySelector('select[name="condition"]') as HTMLSelectElement;
    const options = Array.from(conditionSelect.options).map((o) => o.value);
    expect(options).toContain('new');
    expect(options).toContain('good');
    expect(options).toContain('fair');
    expect(options).toContain('poor');
    expect(options).toContain('broken');
    // Old values should not be present
    expect(options).not.toContain('Excellent');
  });

  it('marks Type as required with asterisk label', () => {
    renderCreate();
    expect(screen.getByText('Type *')).toBeInTheDocument();
  });

  it('shows inline error when Type is empty on submit', async () => {
    renderCreate();
    const nameInput = document.querySelector('input[name="itemName"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Test Item' } });

    fireEvent.click(screen.getByRole('button', { name: /create item/i }));

    await vi.waitFor(() => {
      expect(screen.getByText('Type is required')).toBeInTheDocument();
    });
    expect(mockCreateMutate).not.toHaveBeenCalled();
  });

  it('shows notes preview toggle button', () => {
    renderCreate();
    expect(screen.getByRole('button', { name: /preview/i })).toBeInTheDocument();
  });

  it('toggles notes to preview — shows "Nothing to preview" when notes empty', () => {
    renderCreate();
    const previewBtn = screen.getByRole('button', { name: /preview/i });
    fireEvent.click(previewBtn);
    expect(screen.getByText(/nothing to preview/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
  });

  it('toggles notes to preview — renders markdown content when notes present', () => {
    renderCreate();
    const notesTextarea = document.querySelector('textarea[name="notes"]') as HTMLTextAreaElement;
    fireEvent.change(notesTextarea, { target: { value: '**bold text**' } });

    const previewBtn = screen.getByRole('button', { name: /preview/i });
    fireEvent.click(previewBtn);

    expect(screen.getByTestId('markdown-preview')).toBeInTheDocument();
    expect(document.querySelector('textarea[name="notes"]')).not.toBeInTheDocument();
  });

  it('switches back from preview to edit mode', () => {
    renderCreate();
    const previewBtn = screen.getByRole('button', { name: /preview/i });
    fireEvent.click(previewBtn);
    const editBtn = screen.getByRole('button', { name: /edit/i });
    fireEvent.click(editBtn);
    expect(document.querySelector('textarea[name="notes"]')).toBeInTheDocument();
  });
});

describe('ItemFormPage — Navigation order on save (#2157)', () => {
  it('navigates to detail page before invalidating cache on update', async () => {
    mockItemQuery.mockReturnValue({
      data: {
        data: {
          id: 'item-1',
          itemName: 'MacBook',
          brand: null,
          model: null,
          itemId: null,
          type: 'Electronics',
          condition: 'good',
          room: null,
          inUse: false,
          deductible: false,
          purchaseDate: null,
          warrantyExpires: null,
          replacementValue: null,
          resaleValue: null,
          purchasePrice: null,
          assetId: null,
          notes: null,
          locationId: null,
          lastEditedTime: '2026-01-01',
          purchaseTransactionId: null,
          purchasedFromId: null,
          purchasedFromName: null,
        },
      },
      isLoading: false,
      error: null,
    });

    renderEdit('item-1');

    // Save the form (no field changes required — RHF submits current values).
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await vi.waitFor(() => {
      expect(mockUpdateMutate).toHaveBeenCalledTimes(1);
    });

    // Navigate must be called with the detail URL.
    expect(mockNavigate).toHaveBeenCalledWith('/inventory/items/item-1');

    // Both invalidations must run after navigation.
    expect(mockListInvalidate).toHaveBeenCalled();
    expect(mockGetInvalidate).toHaveBeenCalledWith({ id: 'item-1' });

    // Assert call order via Vitest's invocation call order: navigate must
    // happen BEFORE either invalidate to avoid the React 19 race that drops
    // the navigation when the cache invalidation triggers a refetch + rerender.
    const [navOrder] = mockNavigate.mock.invocationCallOrder;
    const [listOrder] = mockListInvalidate.mock.invocationCallOrder;
    const [getOrder] = mockGetInvalidate.mock.invocationCallOrder;
    if (navOrder === undefined || listOrder === undefined || getOrder === undefined) {
      throw new Error('Expected navigate, list.invalidate and get.invalidate to be called');
    }
    expect(navOrder).toBeLessThan(listOrder);
    expect(navOrder).toBeLessThan(getOrder);
  });

  it('navigates to detail page before invalidating cache on create', async () => {
    renderCreate();

    const nameInput = document.querySelector('input[name="itemName"]') as HTMLInputElement;
    const typeSelect = document.querySelector('select[name="type"]') as HTMLSelectElement;
    fireEvent.change(nameInput, { target: { value: 'New Item' } });
    fireEvent.change(typeSelect, { target: { value: 'Electronics' } });

    fireEvent.click(screen.getByRole('button', { name: /create item/i }));

    await vi.waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledTimes(1);
    });

    // mockCreateMutate's onSuccess returns { data: { id: 'new-id' } }.
    await vi.waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/inventory/items/new-id');
    });

    expect(mockListInvalidate).toHaveBeenCalled();

    const [navOrder] = mockNavigate.mock.invocationCallOrder;
    const [listOrder] = mockListInvalidate.mock.invocationCallOrder;
    if (navOrder === undefined || listOrder === undefined) {
      throw new Error('Expected navigate and list.invalidate to be called');
    }
    expect(navOrder).toBeLessThan(listOrder);
  });
});

// ---------- checkbox population (#2175) ----------

/**
 * Edit-mode regression coverage for #2175. The Radix `CheckboxInput` exposes
 * `checked` / `onCheckedChange`, which is incompatible with RHF's `register()`
 * spread. The form now wires `inUse` / `deductible` through `Controller`, so
 * `reset(itemToFormValues(item))` must propagate the seeded boolean values
 * into the rendered `<button role="checkbox">` elements.
 */
function seededItem(overrides: { inUse?: boolean; deductible?: boolean } = {}) {
  return {
    id: 'item-1',
    itemName: 'MacBook',
    brand: null,
    model: null,
    itemId: null,
    type: 'Electronics',
    condition: 'good',
    room: null,
    inUse: overrides.inUse ?? false,
    deductible: overrides.deductible ?? false,
    purchaseDate: null,
    warrantyExpires: null,
    replacementValue: null,
    resaleValue: null,
    purchasePrice: null,
    assetId: 'ELEC01',
    notes: null,
    locationId: null,
    lastEditedTime: '2026-01-01',
    purchaseTransactionId: null,
    purchasedFromId: null,
    purchasedFromName: null,
  };
}

describe('ItemFormPage — checkbox population (#2175)', () => {
  it('populates In Use checkbox from seeded item in edit mode', async () => {
    mockItemQuery.mockReturnValue({
      data: { data: seededItem({ inUse: true }) },
      isLoading: false,
      error: null,
    });

    renderEdit('item-1');

    const inUse = await screen.findByRole('checkbox', { name: /in use/i });
    await vi.waitFor(() => {
      expect(inUse.getAttribute('aria-checked')).toBe('true');
    });
  });

  it('populates Tax Deductible checkbox from seeded item in edit mode', async () => {
    mockItemQuery.mockReturnValue({
      data: { data: seededItem({ deductible: true }) },
      isLoading: false,
      error: null,
    });

    renderEdit('item-1');

    const deductible = await screen.findByRole('checkbox', { name: /tax deductible/i });
    await vi.waitFor(() => {
      expect(deductible.getAttribute('aria-checked')).toBe('true');
    });
  });

  it('toggles the In Use checkbox in create mode', () => {
    renderCreate();

    const inUse = screen.getByRole('checkbox', { name: /in use/i });
    expect(inUse.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(inUse);
    expect(inUse.getAttribute('aria-checked')).toBe('true');

    fireEvent.click(inUse);
    expect(inUse.getAttribute('aria-checked')).toBe('false');
  });

  it('submits the toggled inUse value in the create payload', async () => {
    renderCreate();

    const inUse = screen.getByRole('checkbox', { name: /in use/i });
    expect(inUse.getAttribute('aria-checked')).toBe('false');

    fireEvent.click(inUse);
    expect(inUse.getAttribute('aria-checked')).toBe('true');

    // Required fields for the create submit path.
    const nameInput = document.querySelector('input[name="itemName"]') as HTMLInputElement;
    const typeSelect = document.querySelector('select[name="type"]') as HTMLSelectElement;
    fireEvent.change(nameInput, { target: { value: 'New Gadget' } });
    fireEvent.change(typeSelect, { target: { value: 'Electronics' } });

    fireEvent.click(screen.getByRole('button', { name: /create item/i }));

    await vi.waitFor(() => {
      expect(mockCreateMutate).toHaveBeenCalledWith(
        expect.objectContaining({ inUse: true, deductible: false })
      );
    });
  });
});
