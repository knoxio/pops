# PRD-045: Item Detail Page

> Epic: [01 — App Package & CRUD UI](../../epics/01-app-package-crud-ui.md)
> Status: Partial

## Overview

Build the full item detail view showing all metadata, photo gallery, connections list, purchase transaction link, location breadcrumb, and warranty status. This page is the primary way a user inspects a single inventory item.

## Routes

| Route                  | Page        |
| ---------------------- | ----------- |
| `/inventory/items/:id` | Item detail |

## UI Components

### Header

| Element         | Detail                                                                             |
| --------------- | ---------------------------------------------------------------------------------- |
| Item name       | Large heading                                                                      |
| Asset ID badge  | Displayed next to name if present; omitted if null                                 |
| Condition badge | Colour-coded: new (blue), good (green), fair (yellow), poor (orange), broken (red) |
| Actions         | Edit button → `/inventory/items/:id/edit`, Delete button → confirmation modal      |

### Photo Gallery

| Element         | Detail                                                |
| --------------- | ----------------------------------------------------- |
| Primary display | First photo shown large                               |
| Thumbnail strip | All photos below primary, clickable to swap           |
| Lightbox        | Click primary photo to open full-screen lightbox view |
| Empty state     | Placeholder graphic when no photos exist              |

### Metadata Section

| Element       | Detail                                                                             |
| ------------- | ---------------------------------------------------------------------------------- |
| Fields        | Brand, Model, Type, Purchase Date, Purchase Price, Replacement Value, Resale Value |
| Layout        | Key-value pairs in a structured grid                                               |
| Null handling | Omit field row entirely when value is null (no "N/A" or dashes)                    |

### Location Breadcrumb

| Element       | Detail                                                                        |
| ------------- | ----------------------------------------------------------------------------- |
| Format        | "Home > Living Room > TV Unit"                                                |
| Interaction   | Each segment is clickable, navigates to filtered items list for that location |
| Null handling | "No location assigned" text when locationId is null                           |

### Warranty Status Indicator

| State                    | Badge                              |
| ------------------------ | ---------------------------------- |
| Expired                  | Red badge: "Expired"               |
| Expiring soon (<90 days) | Yellow badge: "Expires in X days"  |
| Active                   | Green badge: "Warranty until DATE" |
| No warranty              | Grey badge: "No warranty"          |

### Notes Section

| Element     | Detail                                  |
| ----------- | --------------------------------------- |
| Content     | Item's notes field rendered as markdown |
| Empty state | Section hidden when notes is null/empty |

### Connections Section

| Element     | Detail                                            |
| ----------- | ------------------------------------------------- |
| List        | Connected items with name, asset ID, and type     |
| Click       | Each item links to its own detail page            |
| Trace chain | "Trace Chain" button triggers chain visualisation |
| Empty state | "No connections" text                             |

### Purchase Link

| Element | Detail                                                                   |
| ------- | ------------------------------------------------------------------------ |
| Link    | If purchaseTransactionId is set, link to finance transaction detail page |
| Entity  | If purchasedFromId is set, show entity name with link                    |
| Hidden  | Section hidden when neither field is set                                 |

### Delete Confirmation

| Element        | Detail                                                                |
| -------------- | --------------------------------------------------------------------- |
| Modal content  | "Delete ITEM_NAME? This will also remove X connections and Y photos." |
| Confirm action | Delete item → navigate to `/inventory`                                |
| Cancel action  | Close modal, no action                                                |

## API Dependencies

| Procedure                           | Usage                                                              |
| ----------------------------------- | ------------------------------------------------------------------ |
| `inventory.items.get`               | Fetch item with location breadcrumb, connection count, photo count |
| `inventory.connections.listForItem` | Fetch connected items                                              |
| `inventory.connections.traceChain`  | Fetch connection chain for visualisation                           |
| `inventory.photos.listForItem`      | Fetch photos sorted by order                                       |
| `inventory.items.delete`            | Delete item on confirmation                                        |

## Business Rules

- Item detail page loads all data in parallel (item metadata, connections, photos)
- Location breadcrumb is included in the `items.get` response — no separate API call needed
- Warranty status is calculated client-side from warrantyExpiry date relative to current date
- "Expiring soon" threshold is 90 days
- Delete confirmation modal shows connection and photo counts so the user understands the cascade impact
- Purchase link section is hidden entirely when both purchaseTransactionId and purchasedFromId are null
- Notes section is hidden when notes is null or empty string
- Documents section (Paperless-ngx links) is hidden until Epic 04 is built

## Edge Cases

| Case                                | Behaviour                                               |
| ----------------------------------- | ------------------------------------------------------- |
| Item not found (invalid ID)         | 404 page                                                |
| Item has no photos                  | Placeholder graphic, no thumbnail strip                 |
| Item has one photo                  | Primary display only, no thumbnail strip                |
| Item has no connections             | "No connections" text in connections section            |
| Warranty expiry is today            | "Expires in 0 days" (yellow badge)                      |
| Location is null                    | "No location assigned" instead of breadcrumb            |
| All metadata fields are null        | Only name, type, and condition render (required fields) |
| Notes contain malicious HTML/script | Markdown renderer sanitises output                      |

## User Stories

| #   | Story                                                     | Summary                                                                                                       | Status  | Parallelisable |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------- | -------------- |
| 01  | [us-01-item-metadata](us-01-item-metadata.md)             | Header with name/assetId/condition, metadata section, location breadcrumb, notes, purchase link, delete modal | Partial | Yes            |
| 02  | [us-02-photo-gallery](us-02-photo-gallery.md)             | Photo gallery with primary display, thumbnail strip, lightbox view, placeholder                               | Done    | Yes            |
| 03  | [us-03-connections-section](us-03-connections-section.md) | Connections list with names/assetIds, "Trace Chain" button, chain visualisation                               | Partial | Yes            |
| 04  | [us-04-warranty-status](us-04-warranty-status.md)         | Warranty status indicator with colour-coded badges and expiry calculation                                     | Done    | Yes            |

All four stories can be built in parallel — they render independent sections of the same page.

## Out of Scope

- Editing item data (PRD-046)
- Document linking to Paperless-ngx (Epic 04)
- Location tree browsing from this page (Epic 02)
- Connection management (adding/removing connections — Epic 03)

## Drift Check

last checked: 2026-04-18
