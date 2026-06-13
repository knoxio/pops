/**
 * Backend-safe barrel for the inventory domain's persistence layer.
 *
 * Hosts inventory pillar tables (locations, home_inventory, fixtures,
 * item_connections, item_documents, item_photos, item_uploaded_files,
 * item_fixture_connections). Extracted from
 * `apps/pops-api/src/modules/inventory/` per ADR-026.
 *
 * Per the CI-never-breaks pattern the migration is incremental — this PR
 * scaffolds the package and moves only the `locations` slice. The other
 * slices (items, connections, documents, photos, fixtures, document-files,
 * paperless) follow in subsequent PRs. `items`, `connections`, and
 * `documents` are now scaffolded; the live writers still own production.
 */
export * from './errors.js';
export * from './schema.js';

export type { InventoryDb } from './services/internal.js';

export { openInventoryDb, type OpenedInventoryDb } from './open-inventory-db.js';

export * as locationsService from './services/locations.js';
export * as itemsService from './services/items.js';
export * as connectionsService from './services/connections.js';
export * as documentsService from './services/documents.js';

// Public types re-exported at the package root so consumers can name
// them without reaching into the namespaces.
export type {
  CreateLocationInput,
  DeleteLocationStats,
  Location,
  LocationItemsResult,
  LocationListResult,
  LocationTreeNode,
  UpdateLocationInput,
} from './services/locations.js';

export { toLocation } from './services/locations.js';

export type {
  CreateItemInput,
  InventoryRow,
  Item,
  ItemFilters,
  ItemListResult,
  UpdateItemInput,
} from './services/items.js';

export { toItem } from './services/items.js';

export { ItemConflictError, ItemNotFoundError } from './services/items-errors.js';

export type {
  Connection,
  ConnectionListResult,
  CreateConnectionInput,
  GraphData,
  GraphEdge,
  GraphNode,
  ItemConnectionRow,
  TraceNode,
} from './services/connections.js';

export { toConnection } from './services/connections.js';

export {
  ConnectionConflictError,
  ConnectionItemNotFoundError,
  ConnectionNotFoundError,
  SelfConnectionError,
} from './services/connections-errors.js';

export type {
  DocumentListResult,
  DocumentType,
  ItemDocument,
  ItemDocumentRow,
  LinkDocumentInput,
} from './services/documents.js';

export { DOCUMENT_TYPES, toItemDocument } from './services/documents.js';

export {
  DocumentConflictError,
  DocumentItemNotFoundError,
  DocumentNotFoundError,
} from './services/documents-errors.js';
