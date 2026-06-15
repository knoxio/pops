/**
 * Smoke test that the relocated inventory schemas (PRD-245 US-02 / audit H6)
 * resolve from `@pops/inventory-db` with the expected drizzle SQL `name`.
 *
 * Catches "table moved but the export forgot to flip" mistakes during
 * follow-up shuffles. The set MUST cover every table named in
 * `us-02-relocate-inventory-schemas.md` so a regression on either side
 * trips this file.
 */
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  fixtures,
  homeInventory,
  itemConnections,
  itemDocuments,
  itemFixtureConnections,
  itemPhotos,
  itemUploadedFiles,
  locations,
} from '../schema.js';

describe('PRD-245 US-02 inventory schema relocation', () => {
  it.each([
    [fixtures, 'fixtures'],
    [homeInventory, 'home_inventory'],
    [itemConnections, 'item_connections'],
    [itemDocuments, 'item_documents'],
    [itemFixtureConnections, 'item_fixture_connections'],
    [itemPhotos, 'item_photos'],
    [itemUploadedFiles, 'item_uploaded_files'],
    [locations, 'locations'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
