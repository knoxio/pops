/**
 * Backend-safe barrel for the inventory pillar's persistence layer.
 *
 * Hosts inventory pillar tables (locations, home_inventory, fixtures,
 * item_connections, item_documents, item_photos, item_uploaded_files,
 * item_fixture_connections) per ADR-026.
 */
export * from './errors.js';
export * from './row-types.js';
export * from './schema.js';

export type { InventoryDb } from './services/internal.js';

export { openInventoryDb, type OpenedInventoryDb } from './open-inventory-db.js';

export * as locationsService from './services/locations.js';
export * as itemsService from './services/items.js';
export * as connectionsService from './services/connections.js';
export * as documentsService from './services/documents.js';
export * as crossPillarUrisService from './services/cross-pillar-uris.js';

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
  DocumentCreateFailedError,
  DocumentItemNotFoundError,
  DocumentNotFoundError,
} from './services/documents-errors.js';
