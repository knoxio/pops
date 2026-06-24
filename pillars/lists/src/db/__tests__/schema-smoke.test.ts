/**
 * Smoke test that the lists schemas resolve from the pillar's `schema`
 * barrel with the expected drizzle SQL `name`.
 *
 * Catches "table moved but the export forgot to flip" mistakes during
 * follow-up shuffles. The set covers every table the pillar owns so
 * a regression on either side trips this file.
 */
import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { listItems, lists } from '../schema.js';

describe('lists schema barrel resolves table names', () => {
  it.each([
    [lists, 'lists'],
    [listItems, 'list_items'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });
});
