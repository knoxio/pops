# PRD-046: Item Create/Edit Form

> Epic: [01 — App Package & CRUD UI](../../epics/01-app-package-crud-ui.md)
> Status: Done

## Overview

Build a dual-mode form for creating and editing inventory items. The form includes a location picker with tree browser, photo upload with client-side compression, asset ID auto-generation, and a markdown notes editor with preview toggle.

## Routes

| Route                       | Page                      |
| --------------------------- | ------------------------- |
| `/inventory/items/new`      | Create mode               |
| `/inventory/items/:id/edit` | Edit mode (pre-populated) |

## Form Fields

| Field             | Type                       | Required | Validation                            | Default |
| ----------------- | -------------------------- | -------- | ------------------------------------- | ------- |
| Name              | Text input                 | Yes      | Non-empty                             | —       |
| Type              | Select + custom entry      | Yes      | Non-empty                             | —       |
| Brand             | Text input                 | No       | —                                     | null    |
| Model             | Text input                 | No       | —                                     | null    |
| Asset ID          | Text input + auto-generate | No       | Unique (validated on blur)            | null    |
| Location          | Location picker            | No       | Valid location ID                     | null    |
| Condition         | Select                     | No       | One of: new, good, fair, poor, broken | "good"  |
| Purchase Date     | Date picker                | No       | Valid ISO date                        | null    |
| Purchase Price    | Currency input             | No       | Non-negative number                   | null    |
| Replacement Value | Currency input             | No       | Non-negative number                   | null    |
| Resale Value      | Currency input             | No       | Non-negative number                   | null    |
| Warranty Expiry   | Date picker                | No       | Valid ISO date                        | null    |
| Notes             | Markdown textarea          | No       | —                                     | null    |

## UI Components

### Location Picker

| Element   | Detail                                                                                          |
| --------- | ----------------------------------------------------------------------------------------------- |
| Trigger   | Button showing current selection as breadcrumb: "Home > Bedroom > Wardrobe"                     |
| Overlay   | Tree view of all locations with expand/collapse, opens on trigger click                         |
| Search    | Filter input within the overlay to find locations by name                                       |
| Quick-add | "Add Location" button within the overlay creates a new location inline without leaving the form |
| Empty     | "No locations — create one" with inline quick-add                                               |

### Photo Upload

| Element     | Detail                                                                          |
| ----------- | ------------------------------------------------------------------------------- |
| Desktop     | Drag-and-drop zone + file picker button                                         |
| Mobile      | Camera trigger via `<input type="file" accept="image/*" capture="environment">` |
| Compression | On upload: resize to 1920px max dimension, HEIC→JPEG, strip EXIF                |
| Preview     | Thumbnail grid of uploaded/existing photos                                      |
| Reorder     | Drag to reorder photos in edit mode                                             |
| Delete      | Remove button on each photo thumbnail with confirmation                         |

### Asset ID Generation

| Element              | Detail                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------- |
| Auto-generate button | Adjacent to asset ID input; generates TYPE prefix + sequential number (e.g., "HDMI01") |
| Manual entry         | Always accepted; auto-generate is optional                                             |
| Uniqueness check     | Validated on blur; shows inline error if duplicate                                     |

### Notes Editor

| Element | Detail                                                                |
| ------- | --------------------------------------------------------------------- |
| Input   | Textarea for markdown content                                         |
| Preview | Toggle to render markdown preview alongside or replacing the textarea |

## API Dependencies

| Procedure                         | Usage                                 |
| --------------------------------- | ------------------------------------- |
| `inventory.items.create`          | Create new item                       |
| `inventory.items.update`          | Update existing item                  |
| `inventory.items.get`             | Pre-populate form in edit mode        |
| `inventory.items.searchByAssetId` | Validate asset ID uniqueness on blur  |
| `inventory.locations.getTree`     | Populate location picker tree         |
| `inventory.locations.create`      | Quick-add location from within picker |
| `inventory.photos.upload`         | Upload compressed photo               |
| `inventory.photos.delete`         | Remove photo                          |
| `inventory.photos.reorder`        | Save new photo order                  |
| `inventory.photos.listForItem`    | Load existing photos in edit mode     |

## Business Rules

- Create mode starts with an empty form; edit mode pre-populates all fields from the existing item
- Type select is populated from distinct types in the database plus a custom entry option (user can type a new type)
- Asset ID auto-generation takes the first word of the selected type, uppercases it, and appends the next sequential number (e.g., type "Electronics" + 3 existing ELEC items → "ELEC04")
- Asset ID uniqueness is validated on blur — the check calls `searchByAssetId` and shows an inline error if the ID already belongs to a different item
- Photo compression happens client-side before upload to reduce bandwidth and server load
- In edit mode, existing photos are loaded and displayed; new photos can be added, existing ones deleted or reordered
- Form submission validates all required fields and asset ID uniqueness before calling create/update
- After successful create: navigate to `/inventory/items/:id` (the new item's detail page)
- After successful update: navigate to `/inventory/items/:id` (back to detail page)
- Unsaved changes warning: prompt user before navigating away if the form has been modified

## Edge Cases

| Case                                         | Behaviour                                                    |
| -------------------------------------------- | ------------------------------------------------------------ |
| Asset ID already in use                      | Inline error on blur: "Asset ID already in use by ITEM_NAME" |
| Asset ID belongs to current item (edit mode) | No error — the item can keep its own asset ID                |
| Type select with no existing types           | Only custom entry available                                  |
| Photo upload fails                           | Error toast, photo not added to list                         |
| HEIC file on desktop (no native support)     | Converted to JPEG during compression step                    |
| Very large image (>10MB)                     | Compressed to within 1920px bound before upload              |
| Location deleted while picker is open        | Tree refreshes on next open; stale selection cleared         |
| Navigate away with unsaved changes           | Browser confirmation dialog                                  |

## User Stories

| #   | Story                                                     | Summary                                                                                    | Status | Parallelisable |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------ | -------------- |
| 01  | [us-01-form-layout](us-01-form-layout.md)                 | Form with all fields, validation rules, create/edit modes, submit handlers                 | Done   | Yes            |
| 02  | [us-02-location-picker](us-02-location-picker.md)         | Location picker with breadcrumb display, tree overlay, search, inline quick-add            | Done   | Yes            |
| 03  | [us-03-photo-upload](us-03-photo-upload.md)               | Photo upload with drag-and-drop, camera, compression, reorder, delete                      | Done   | Yes            |
| 04  | [us-04-asset-id-generation](us-04-asset-id-generation.md) | Auto-generate asset ID from type prefix + sequential number, uniqueness validation on blur | Done   | Yes            |

All four stories can be built in parallel. US-01 provides the form shell; US-02, US-03, and US-04 are self-contained components that plug into the form.

## Out of Scope

- Batch item creation (import from spreadsheet)
- Barcode/QR code scanning for asset IDs
- Auto-populating item details from a product database
- Connection management from the form (done on the detail page)

## Drift Check

last checked: 2026-04-17
