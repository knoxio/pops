/**
 * Smoke test that the relocated lists schemas (PRD-245 US-06 / audit H6)
 * resolve from `@pops/app-lists-db` with the expected drizzle SQL `name`.
 *
 * Catches "table moved but the export forgot to flip" mistakes during
 * follow-up shuffles. The set MUST cover every table named in
 * `us-06-relocate-lists-schemas.md` so a regression on either side
 * trips this file.
 */
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { listItems, lists } from '../schema.js';

describe('PRD-245 US-06 lists schema relocation', () => {
  it.each([
    [lists, 'lists'],
    [listItems, 'list_items'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
