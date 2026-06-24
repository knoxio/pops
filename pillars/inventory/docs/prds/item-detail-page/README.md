# Item Detail Page

Status: Done. The detail view is shipped end-to-end, including connection management,
Paperless document linkage, and photo reordering that the original scope deferred.
Only the configurable warranty threshold remains an idea (see
`../../ideas/configurable-warranty-threshold.md`).

The single-item inspection page: all metadata, a photo gallery, the connection
graph, linked Paperless documents, location breadcrumb, purchase links, and a
warranty status badge. Served by the inventory app at `pillars/inventory/app`,
backed entirely by the inventory pillar's own REST contract.

## Route

| Route                  | Page        |
| ---------------------- | ----------- |
| `/inventory/items/:id` | Item detail |

## Data sources (inventory REST contract)

The page model loads in parallel; nothing is bundled into a single mega-response.

| Endpoint                               | Use                                                |
| -------------------------------------- | -------------------------------------------------- |
| `GET /items/:id`                       | Item metadata (the `InventoryItem` shape)          |
| `GET /locations/:id/path`              | Ancestor chain for the breadcrumb (only when set)  |
| `GET /items/:itemId/connections`       | Direct connection edges                            |
| `GET /items/:itemId/connections/trace` | Connection chain as a depth-bearing tree           |
| `GET /items/:itemId/connections/graph` | Connection subgraph (nodes + edges) for graph view |
| `GET /items/:itemId/photos`            | Photos for the gallery                             |
| `GET /items/:itemId/documents`         | Linked Paperless documents                         |
| `GET /paperless/status`                | Whether Paperless is configured / reachable        |
| `DELETE /items/:id`                    | Delete the item                                    |
| `DELETE /connections?itemAId&itemBId`  | Disconnect two items                               |
| `PATCH /items/:itemId/photos/reorder`  | Persist drag-reordered photo order                 |

Item fields consumed: `itemName`, `brand`, `model`, `type`, `condition`,
`warrantyExpires`, `room`, `assetId`, `inUse`, `purchaseDate`, `replacementValue`,
`locationId`, `purchaseTransactionId`, `purchasedFromId`, `purchasedFromName`,
`notes`. Connection, fixture, document, paperless, warranty and photo records all
live in the inventory pillar's own SQLite DB.

## Sections and rules

### Header

- [x] Page renders at `/inventory/items/:id`; item name is the large heading, with
      `brand • model` shown as a sub-line when either is present.
- [x] Edit action links to `/inventory/items/:id/edit`.
- [x] Delete action opens a confirm dialog reading "Delete NAME? This will also
      remove X connection(s) and Y photo(s)." with correct singular/plural, where the
      counts come from the loaded connections list length and the photos total.
- [x] Confirming calls `DELETE /items/:id`, toasts success, and navigates to
      `/inventory`; cancelling closes the dialog with no side effect.

### Metadata grid

- [x] Renders key-value tiles: Type (badge), Condition (colour-coded badge),
      Warranty (badge, see below), Room, Asset ID (mono badge), Status
      ("In Use" / "Stored" from `inUse`), Purchased (locale month/year), Replacement
      (currency).
- [x] Null/absent fields are omitted entirely — no "N/A" or dash placeholders.
      Warranty and Status always render (they encode meaningful null states).

### Warranty badge

- [x] Computed client-side from `warrantyExpires` vs. today, in calendar days, via
      `getWarrantyStatus` in `@pops/ui`:
  - null → grey "No warranty"
  - days < 0 → red "Expired"
  - 0 ≤ days ≤ 90 → yellow "Expires in X days" (today renders "Expires in 0 days")
  - days > 90 → green "Warranty until DATE"
- [x] Colours use semantic status tokens, not hardcoded hex.
- The 90-day window is fixed; making it configurable is the carved-out idea.

### Location breadcrumb

- [x] When `locationId` is null, shows "No location assigned".
- [x] Otherwise fetches `GET /locations/:id/path` and renders the ancestor chain
      (root → leaf) with `>` separators; each segment links to
      `/inventory?location=:locationId`. Shows a skeleton while the path loads.

### Purchase links

- [x] When `purchaseTransactionId` is set, links to
      `/finance/transactions/:id` ("View transaction").
- [x] When `purchasedFromId` and `purchasedFromName` are set, shows the vendor name.
- [x] Section is hidden when both are null.

### Notes

- [x] Rendered as markdown via `react-markdown` + `rehype-sanitize` (XSS-safe).
- [x] Hidden when `notes` is null or empty.

### Photo gallery

- [x] No photos → placeholder graphic; exactly one photo → primary image, no
      thumbnail strip; multiple → primary plus thumbnail strip (active thumbnail
      highlighted, click swaps the primary).
- [x] Clicking the primary opens a full-screen lightbox with prev/next; closable
      via the X button, Escape, or clicking the backdrop.
- [x] Photos render sorted by `sortOrder`; image URLs are built from `filePath`
      under `/api/inventory/photos`, encoding each path segment so slashes survive.
- [x] With more than one photo, a drag-to-reorder grid persists the new order via
      `PATCH /items/:itemId/photos/reorder`.

### Connections

- [x] "Connected Items" lists each edge; for each, a per-row query resolves the
      connected item's name, brand, asset-id badge and type badge, linking to its
      detail page. Empty state: "No connected items yet."
- [x] A connect dialog adds a new connection; the SDK auto-invalidates the
      `connections` prefix on success.
- [x] Each row has a disconnect action behind a confirm dialog titled
      "Disconnect NAME?"; confirming calls `DELETE /connections`, cancelling is a no-op.
- [x] When at least one connection exists, a "Connection Chain" section renders the
      `trace` tree (recursive, indented by depth, current item highlighted and marked
      "(current)", nodes navigate to their detail page) with a "View Graph" toggle that
      swaps to the node/edge graph from `connections/graph`. Hidden entirely with no
      connections.

### Documents (Paperless)

- [x] Section is hidden when Paperless is not configured.
- [x] When configured but unreachable, shows "Paperless-ngx unavailable".
- [x] When available, lists linked documents from `GET /items/:itemId/documents`,
      grouped by document type (receipt, warranty, manual, invoice, other), each with a
      thumbnail, an external "View in Paperless" link, and an unlink action. A link
      dialog attaches new documents. Empty state: "No documents linked yet."

## Edge cases

| Case                              | Behaviour                                            |
| --------------------------------- | ---------------------------------------------------- |
| Invalid id (`GET /items/:id` 404) | "Item not found" alert + "Back to inventory" link    |
| No photos                         | Placeholder graphic, no thumbnail strip              |
| One photo                         | Primary only, no thumbnail strip                     |
| No connections                    | "No connected items yet." and no chain/graph section |
| `locationId` null                 | "No location assigned"                               |
| All optional metadata null        | Only name plus the always-on Warranty/Status tiles   |
| Warranty expiry today             | "Expires in 0 days" (yellow)                         |
| Notes with hostile HTML           | Sanitised by `rehype-sanitize`                       |

## Out of scope

- Editing item fields — that is the item form page (`/inventory/items/:id/edit`).
- Configurable "expiring soon" threshold — see
  `../../ideas/configurable-warranty-threshold.md`.
