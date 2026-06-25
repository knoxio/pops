# Item Create/Edit Form

> Status: Done — except item-form type select is a static list (no combobox / no custom entry), and the location quick-add has no parent picker or item-count display. See [ideas/item-form-type-combobox-and-location-affordances.md](../ideas/item-form-type-combobox-and-location-affordances.md).

A dual-mode form for creating and editing inventory items in the inventory pillar's `app`. Built on `react-hook-form`, it wires the item, location, photo, document and connection REST endpoints into one page. The same component (`ItemFormPage`) serves both modes, keyed off the presence of an `:id` route param.

## Routes

| Route                       | Mode                                       |
| --------------------------- | ------------------------------------------ |
| `/inventory/items/new`      | Create (empty form)                        |
| `/inventory/items/:id/edit` | Edit (pre-populated from `GET /items/:id`) |

## Form fields

| Field                                 | Control                       | Required | Notes                                                                                                          |
| ------------------------------------- | ----------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| Item Name                             | Text                          | Yes      | `required` rule, inline "Item name is required"                                                                |
| Brand / Model                         | Text                          | No       | Stored as null when blank                                                                                      |
| Item ID / SKU                         | Text                          | No       | Free-form (`itemId`)                                                                                           |
| Asset ID                              | Text + auto-generate          | No       | See Asset ID                                                                                                   |
| Type                                  | Select (static list)          | Yes      | `required`; options: Electronics, Furniture, Appliance, Clothing, Tools, Sports, Kitchen, Office, Other        |
| Condition                             | Select                        | No       | Options from `INVENTORY_CONDITIONS` (Excellent/New/Good/Fair/Poor/Broken); defaults to **Good** in create mode |
| Location                              | Location picker               | No       | See Location picker                                                                                            |
| In Use / Tax Deductible               | Checkboxes (Controller)       | No       | Booleans, default false                                                                                        |
| Purchase Date / Warranty Expires      | Date input                    | No       | ISO date strings                                                                                               |
| Purchase / Replacement / Resale Value | Number (`step=0.01`, `min=0`) | No       | Sent as numbers or null when blank                                                                             |
| Notes                                 | Markdown textarea + preview   | No       | See Notes editor                                                                                               |

On submit, blank text/number fields are coerced to `null`; numbers via `parseFloat`. The legacy `room` field is always sent as `null` (`locationId` supersedes it).

## REST API surface (inventory pillar)

| Method & path                                    | Use                                                      |
| ------------------------------------------------ | -------------------------------------------------------- |
| `POST /items`                                    | Create item                                              |
| `PATCH /items/:id`                               | Update item                                              |
| `GET /items/:id`                                 | Pre-populate edit mode                                   |
| `GET /items/search/by-asset-id?assetId=`         | Asset ID uniqueness check (returns matched item or null) |
| `GET /items/stats/count-by-asset-prefix?prefix=` | Sequential number for auto-generate                      |
| `GET /items?search=&limit=`                      | Connection search (create mode)                          |
| `GET /locations/tree`                            | Location picker tree                                     |
| `POST /locations`                                | Inline quick-add location                                |
| `POST /items/:itemId/photos`                     | Upload compressed photo (base64 body)                    |
| `GET /items/:itemId/photos`                      | Existing photos in edit mode                             |
| `PATCH /items/:itemId/photos/reorder`            | Save new photo order                                     |
| `DELETE /photos/:id`                             | Delete a photo                                           |
| `POST /connections`                              | Attach a pending connection after create                 |

## Asset ID

- "Auto-generate" button sits beside the Asset ID input; disabled when Type is empty.
- Prefix = first word of Type, uppercased; ≤6 chars kept whole, otherwise truncated to 4 (`extractPrefix`).
- Next number = `count-by-asset-prefix` + 1, zero-padded to 2 digits, widening to 3 at 100+.
- On blur, a non-empty Asset ID is validated against `search/by-asset-id`; a match on a **different** item shows inline "Asset ID already in use by NAME". A spinner shows while checking. Empty value skips the check. In edit mode the item's own Asset ID never errors.

## Location picker

- Trigger button is a `combobox` showing the selected location as a `›`-joined breadcrumb, or the placeholder when none.
- Popover holds a search-filtered, expand/collapse tree of `GET /locations/tree`. Selecting a node sets `locationId` and closes.
- "Clear selection" sets `locationId` to null.
- "Add location" reveals an inline name input; saving calls `POST /locations` with the **currently selected node as parent** (or root when none), toasts, and refetches the tree.
- In create mode, a `?locationId=` query param pre-selects that location when it exists in the tree.

## Photo upload

- Desktop drag-and-drop zone (border highlight on drag-over) plus a file-picker button; mobile camera via `<input accept="image/*" capture="environment">`. Batch selection supported.
- Accepts JPEG, PNG, WebP, HEIC/HEIF.
- `useImageProcessor` runs client-side before upload: HEIC/HEIF → JPEG (`heic2any`), resize to fit a 1920×1920 box and strip EXIF (`browser-image-compression`, quality 0.8). Compressed image is uploaded as base64.
- Edit mode loads existing photos into a sortable grid; drag-reorder saves via the reorder endpoint; each thumbnail has a delete button gated behind an inline confirm.
- Failed uploads toast an error and are not added to the grid.

## Notes editor

- Markdown `textarea` with a Preview/Edit toggle. Preview renders via `react-markdown` + `rehype-sanitize`; empty notes show "Nothing to preview".

## Connections (create mode only)

- A search box (`GET /items?search=`, enabled at ≥2 chars) lets the user queue items to link. After the item is created, each pending connection is attached via `POST /connections`; the success toast reports how many connected.

## Documents

- A documents section is rendered; in create mode it prompts to save the item first before attaching.

## Business rules & edge cases

- [x] Create mode renders an empty form at `/inventory/items/new`; edit mode pre-populates from `GET /items/:id`.
- [x] Item Name is required and blocks submit; Type is required and shows an inline error on submit when empty.
- [x] Condition defaults to "Good" in create mode and is normalised to title-case when loaded from storage.
- [x] Currency inputs constrain to non-negative numbers (`min=0`, `step=0.01`); blank → null in the payload.
- [x] Create submits `POST /items` then navigates to `/inventory/items/:id`; update submits `PATCH /items/:id` then navigates back to the detail page. Navigation fires before cache invalidation to avoid a React-19 refetch dropping it.
- [x] Auto-generate is disabled with an empty Type; generated IDs zero-pad to 2 digits and widen to 3 at 100+.
- [x] Asset ID uniqueness validates on blur, skips empty values, and ignores the item's own ID in edit mode.
- [x] Location quick-add creates and selects in one step, attaching to the selected node (or root) as parent, and refreshes the tree.
- [x] Photos compress client-side (1920px box, HEIC→JPEG, EXIF stripped) before a base64 upload; failures toast and are dropped.
- [x] Existing photos load in edit mode, reorder by drag, and delete behind a confirmation.
- [x] A `beforeunload` guard warns on navigating away from a dirty form.
- [x] Edit mode renders a not-found view when `GET /items/:id` returns `NOT_FOUND`.

## Out of scope

- Batch / spreadsheet import, barcode/QR scanning, product-database auto-fill.
- Editing connections from the form (handled on the detail page).
  </content>
  </invoke>
