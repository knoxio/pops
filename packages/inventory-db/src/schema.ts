/**
 * Inventory domain table barrel.
 *
 * Canonical definitions for inventory-owned tables (home_inventory,
 * locations, fixtures, item_connections, item_fixture_connections,
 * item_documents, item_photos, item_uploaded_files) live in this
 * package per PRD-245 US-02 (audit H6/H7).
 *
 */
export { fixtures } from './schema/fixtures.js';
export { homeInventory } from './schema/inventory.js';
export { itemConnections } from './schema/item-connections.js';
export { itemDocuments } from './schema/item-documents.js';
export { itemFixtureConnections } from './schema/item-fixture-connections.js';
export { itemPhotos } from './schema/item-photos.js';
export { itemUploadedFiles } from './schema/item-uploaded-files.js';
export { locations } from './schema/locations.js';
