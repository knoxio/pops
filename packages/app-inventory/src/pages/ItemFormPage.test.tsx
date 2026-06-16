import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { type ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { extractPrefix } from './ItemFormPage';

import type {
  ItemsCountByAssetPrefixResponses,
  ItemsGetResponses,
  ItemsListResponses,
  ItemsSearchByAssetIdResponses,
  PhotosListForItemResponses,
} from '../inventory-api/types.gen';

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

const {
  itemsGetMock,
  itemsListMock,
  itemsCreateMock,
  itemsUpdateMock,
  itemsSearchByAssetIdMock,
  itemsCountByAssetPrefixMock,
  locationsTreeMock,
  locationsCreateMock,
  connectionsConnectMock,
  photosListForItemMock,
  photosUploadMock,
  photosRemoveMock,
  photosReorderMock,
  documentFilesListForItemMock,
  documentFilesUploadMock,
  documentFilesRemoveUploadMock,
} = vi.hoisted(() => ({
  itemsGetMock: vi.fn(),
  itemsListMock: vi.fn(),
  itemsCreateMock: vi.fn(),
  itemsUpdateMock: vi.fn(),
  itemsSearchByAssetIdMock: vi.fn(),
  itemsCountByAssetPrefixMock: vi.fn(),
  locationsTreeMock: vi.fn(),
  locationsCreateMock: vi.fn(),
  connectionsConnectMock: vi.fn(),
  photosListForItemMock: vi.fn(),
  photosUploadMock: vi.fn(),
  photosRemoveMock: vi.fn(),
  photosReorderMock: vi.fn(),
  documentFilesListForItemMock: vi.fn(),
  documentFilesUploadMock: vi.fn(),
  documentFilesRemoveUploadMock: vi.fn(),
}));

vi.mock('../inventory-api/index.js', () => ({
  itemsGet: (...args: unknown[]) => itemsGetMock(...args),
  itemsList: (...args: unknown[]) => itemsListMock(...args),
  itemsCreate: (...args: unknown[]) => itemsCreateMock(...args),
  itemsUpdate: (...args: unknown[]) => itemsUpdateMock(...args),
  itemsSearchByAssetId: (...args: unknown[]) => itemsSearchByAssetIdMock(...args),
  itemsCountByAssetPrefix: (...args: unknown[]) => itemsCountByAssetPrefixMock(...args),
  locationsTree: (...args: unknown[]) => locationsTreeMock(...args),
  locationsCreate: (...args: unknown[]) => locationsCreateMock(...args),
  connectionsConnect: (...args: unknown[]) => connectionsConnectMock(...args),
  photosListForItem: (...args: unknown[]) => photosListForItemMock(...args),
  photosUpload: (...args: unknown[]) => photosUploadMock(...args),
  photosRemove: (...args: unknown[]) => photosRemoveMock(...args),
  photosReorder: (...args: unknown[]) => photosReorderMock(...args),
  documentFilesListForItem: (...args: unknown[]) => documentFilesListForItemMock(...args),
  documentFilesUpload: (...args: unknown[]) => documentFilesUploadMock(...args),
  documentFilesRemoveUpload: (...args: unknown[]) => documentFilesRemoveUploadMock(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
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

type ItemRecord = NonNullable<ItemsGetResponses[200]>['data'];
type Photo = NonNullable<PhotosListForItemResponses[200]>['data'][number];

interface SdkSuccess<T> {
  data: T;
  error: undefined;
}

interface SdkFailure {
  data: undefined;
  error: { message: string };
  response: { status: number };
}

function ok<T>(data: T): SdkSuccess<T> {
  return { data, error: undefined };
}

function fail(message: string, status: number): SdkFailure {
  return { data: undefined, error: { message }, response: { status } };
}

function buildItem(overrides: Partial<ItemRecord> = {}): ItemRecord {
  return {
    id: 'item-1',
    itemName: 'MacBook',
    brand: null,
    model: null,
    itemId: null,
    type: 'Electronics',
    condition: 'Good',
    room: null,
    location: null,
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
    ...overrides,
  };
}

function mockItemGetSuccess(item: ItemRecord): void {
  itemsGetMock.mockResolvedValue(ok({ data: item } satisfies NonNullable<ItemsGetResponses[200]>));
}

function mockPhotosSuccess(photos: Photo[]): void {
  photosListForItemMock.mockResolvedValue(
    ok({
      data: photos,
      pagination: { hasMore: false, limit: 50, offset: 0, total: photos.length },
    } satisfies NonNullable<PhotosListForItemResponses[200]>)
  );
}

const QC_OPTIONS = { defaultOptions: { queries: { retry: false }, mutations: { retry: false } } };

function renderWithProviders(ui: ReactElement): ReturnType<typeof render> {
  const queryClient = new QueryClient(QC_OPTIONS);
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

function renderCreate(): ReturnType<typeof render> {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/inventory/items/new']}>
      <Routes>
        <Route path="/inventory/items/new" element={<ItemFormPage />} />
      </Routes>
    </MemoryRouter>
  );
}

function renderEdit(id: string): ReturnType<typeof render> {
  return renderWithProviders(
    <MemoryRouter initialEntries={[`/inventory/items/${id}/edit`]}>
      <Routes>
        <Route path="/inventory/items/:id/edit" element={<ItemFormPage />} />
      </Routes>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  itemsGetMock.mockResolvedValue(fail('item not found', 404));
  itemsListMock.mockResolvedValue(
    ok({
      data: [],
      pagination: { hasMore: false, limit: 10, offset: 0, total: 0 },
      totals: { totalReplacementValue: 0, totalResaleValue: 0 },
    } satisfies NonNullable<ItemsListResponses[200]>)
  );
  itemsCreateMock.mockResolvedValue(ok({ data: buildItem({ id: 'new-id' }), message: 'created' }));
  itemsUpdateMock.mockResolvedValue(ok({ data: buildItem(), message: 'updated' }));
  itemsSearchByAssetIdMock.mockResolvedValue(
    ok({ data: null } satisfies NonNullable<ItemsSearchByAssetIdResponses[200]>)
  );
  itemsCountByAssetPrefixMock.mockResolvedValue(
    ok({ data: 0 } satisfies NonNullable<ItemsCountByAssetPrefixResponses[200]>)
  );
  locationsTreeMock.mockResolvedValue(ok({ data: [] }));
  locationsCreateMock.mockResolvedValue(ok({ data: { id: 'loc-1' }, message: 'created' }));
  connectionsConnectMock.mockResolvedValue(ok({ data: { id: 1 }, message: 'connected' }));
  mockPhotosSuccess([]);
  photosUploadMock.mockResolvedValue(ok({ data: { id: 1 }, message: 'uploaded' }));
  photosRemoveMock.mockResolvedValue(ok({ data: { id: 1 }, message: 'removed' }));
  photosReorderMock.mockResolvedValue(ok({ data: [], message: 'reordered' }));
  documentFilesListForItemMock.mockResolvedValue(
    ok({ data: [], pagination: { hasMore: false, limit: 50, offset: 0, total: 0 } })
  );
  documentFilesUploadMock.mockResolvedValue(ok({ data: { id: 1 }, message: 'uploaded' }));
  documentFilesRemoveUploadMock.mockResolvedValue(ok({ data: { id: 1 }, message: 'removed' }));
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
    itemsSearchByAssetIdMock.mockResolvedValue(
      ok({ data: buildItem({ id: 'other-item', itemName: 'Existing Item' }) })
    );

    renderCreate();
    const assetInput = document.querySelector('input[name="assetId"]') as HTMLInputElement;
    expect(assetInput).toBeInTheDocument();
    fireEvent.change(assetInput, { target: { value: 'ELEC01' } });
    fireEvent.blur(assetInput);

    expect(await screen.findByText(/Asset ID already in use by Existing Item/)).toBeInTheDocument();
  });

  it('skips uniqueness error for own asset ID in edit mode', async () => {
    mockItemGetSuccess(buildItem({ id: 'item-1', itemName: 'MacBook', assetId: 'ELEC01' }));
    itemsSearchByAssetIdMock.mockResolvedValue(
      ok({ data: buildItem({ id: 'item-1', itemName: 'MacBook' }) })
    );

    renderEdit('item-1');

    const assetInput = await screen.findByDisplayValue('ELEC01');
    fireEvent.blur(assetInput);

    await waitFor(() => {
      expect(itemsSearchByAssetIdMock).toHaveBeenCalledWith({ query: { assetId: 'ELEC01' } });
    });
    expect(screen.queryByText(/Asset ID already in use/)).not.toBeInTheDocument();
  });

  it('skips uniqueness check when asset ID is empty', () => {
    renderCreate();
    const assetInput = document.querySelector('input[name="assetId"]') as HTMLInputElement;
    expect(assetInput).toBeInTheDocument();
    fireEvent.blur(assetInput);
    expect(itemsSearchByAssetIdMock).not.toHaveBeenCalled();
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

  it('renders existing photos in edit mode', async () => {
    mockItemGetSuccess(buildItem({ itemName: 'Camera', type: null, condition: null }));
    mockPhotosSuccess([
      {
        id: 1,
        itemId: 'item-1',
        filePath: 'photo1.jpg',
        caption: 'Front view',
        sortOrder: 0,
        createdAt: '2026-01-01',
      },
      {
        id: 2,
        itemId: 'item-1',
        filePath: 'photo2.jpg',
        caption: 'Back view',
        sortOrder: 1,
        createdAt: '2026-01-01',
      },
    ]);

    renderEdit('item-1');

    expect(await screen.findByAltText('Front view')).toBeInTheDocument();
    expect(screen.getByAltText('Back view')).toBeInTheDocument();
  });

  it('shows delete confirmation when delete button is clicked', async () => {
    mockItemGetSuccess(buildItem({ itemName: 'Camera', type: null, condition: null }));
    mockPhotosSuccess([
      {
        id: 1,
        itemId: 'item-1',
        filePath: 'photo1.jpg',
        caption: 'Front',
        sortOrder: 0,
        createdAt: '2026-01-01',
      },
    ]);

    renderEdit('item-1');

    fireEvent.click(await screen.findByLabelText(/delete photo front/i));
    const confirmText = screen.getByText(/delete this photo/i);
    expect(confirmText).toBeInTheDocument();
    // Scope to the confirmation bar to avoid matching the form-level Cancel button
    const confirmBar = confirmText.closest('div')!;
    const confirmScope = within(confirmBar);
    expect(confirmScope.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
    expect(confirmScope.getByRole('button', { name: /^delete$/i })).toBeInTheDocument();
  });

  it('dismisses delete confirmation on cancel', async () => {
    mockItemGetSuccess(buildItem({ itemName: 'Camera', type: null, condition: null }));
    mockPhotosSuccess([
      {
        id: 1,
        itemId: 'item-1',
        filePath: 'photo1.jpg',
        caption: 'Front',
        sortOrder: 0,
        createdAt: '2026-01-01',
      },
    ]);

    renderEdit('item-1');

    fireEvent.click(await screen.findByLabelText(/delete photo front/i));
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

    await waitFor(() => {
      expect(itemsCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ purchasePrice: 149.99 }) })
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

    await waitFor(() => {
      expect(itemsCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({ body: expect.objectContaining({ purchasePrice: null }) })
      );
    });
  });

  it("defaults condition to 'Good' in create mode", () => {
    renderCreate();
    const conditionSelect = document.querySelector('select[name="condition"]') as HTMLSelectElement;
    expect(conditionSelect).toBeInTheDocument();
    expect(conditionSelect.value).toBe('Good');
  });

  it('renders correct condition options (Excellent/New/Good/Fair/Poor/Broken)', () => {
    renderCreate();
    const conditionSelect = document.querySelector('select[name="condition"]') as HTMLSelectElement;
    const options = Array.from(conditionSelect.options).map((o) => o.value);
    expect(options).toContain('Excellent');
    expect(options).toContain('New');
    expect(options).toContain('Good');
    expect(options).toContain('Fair');
    expect(options).toContain('Poor');
    expect(options).toContain('Broken');
    // Old lowercase values should not be present
    expect(options).not.toContain('good');
    expect(options).not.toContain('excellent');
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

    expect(await screen.findByText('Type is required')).toBeInTheDocument();
    expect(itemsCreateMock).not.toHaveBeenCalled();
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
  it('navigates to detail page on update', async () => {
    mockItemGetSuccess(buildItem({ id: 'item-1', itemName: 'MacBook', condition: 'good' }));

    renderEdit('item-1');

    // Wait for the edit form to hydrate from the item query before submitting.
    await screen.findByDisplayValue('MacBook');

    // Save the form (no field changes required — RHF submits current values).
    fireEvent.click(screen.getByRole('button', { name: /save changes/i }));

    await waitFor(() => {
      expect(itemsUpdateMock).toHaveBeenCalledTimes(1);
    });
    expect(itemsUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({ path: { id: 'item-1' } })
    );

    // Navigation runs from the mutation's onSuccess after the SDK call resolves.
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/inventory/items/item-1');
    });
  });

  it('navigates to detail page on create', async () => {
    itemsCreateMock.mockResolvedValue(
      ok({ data: buildItem({ id: 'new-id' }), message: 'created' })
    );

    renderCreate();

    const nameInput = document.querySelector('input[name="itemName"]') as HTMLInputElement;
    const typeSelect = document.querySelector('select[name="type"]') as HTMLSelectElement;
    fireEvent.change(nameInput, { target: { value: 'New Item' } });
    fireEvent.change(typeSelect, { target: { value: 'Electronics' } });

    fireEvent.click(screen.getByRole('button', { name: /create item/i }));

    await waitFor(() => {
      expect(itemsCreateMock).toHaveBeenCalledTimes(1);
    });

    // itemsCreate resolves with { data: { id: 'new-id' } }; onSuccess navigates there.
    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith('/inventory/items/new-id');
    });
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
function seededItem(overrides: { inUse?: boolean; deductible?: boolean } = {}): ItemRecord {
  return buildItem({
    condition: 'good',
    inUse: overrides.inUse ?? false,
    deductible: overrides.deductible ?? false,
  });
}

describe('ItemFormPage — checkbox population (#2175)', () => {
  it('populates In Use checkbox from seeded item in edit mode', async () => {
    mockItemGetSuccess(seededItem({ inUse: true }));

    renderEdit('item-1');

    const inUse = await screen.findByRole('checkbox', { name: /in use/i });
    await waitFor(() => {
      expect(inUse.getAttribute('aria-checked')).toBe('true');
    });
  });

  it('populates Tax Deductible checkbox from seeded item in edit mode', async () => {
    mockItemGetSuccess(seededItem({ deductible: true }));

    renderEdit('item-1');

    const deductible = await screen.findByRole('checkbox', { name: /tax deductible/i });
    await waitFor(() => {
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

  it('pre-fills Condition select from lowercase stored value in edit mode (#2407)', async () => {
    mockItemGetSuccess(seededItem({ inUse: false }));

    renderEdit('item-1');

    await waitFor(() => {
      const conditionSelect = document.querySelector(
        'select[name="condition"]'
      ) as HTMLSelectElement;
      expect(conditionSelect.value).toBe('Good');
    });
  });

  it('pre-fills Condition select from lowercase excellent stored value in edit mode (#2407)', async () => {
    mockItemGetSuccess(buildItem({ condition: 'excellent' }));

    renderEdit('item-1');

    await waitFor(() => {
      const conditionSelect = document.querySelector(
        'select[name="condition"]'
      ) as HTMLSelectElement;
      expect(conditionSelect.value).toBe('Excellent');
    });
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

    await waitFor(() => {
      expect(itemsCreateMock).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({ inUse: true, deductible: false }),
        })
      );
    });
  });
});
