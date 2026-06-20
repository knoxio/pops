/**
 * Smoke test for the cross-pillar shared schema (PRD-245 US-07 / C5).
 *
 * Locks the drizzle SQL `name` of every table this package owns, plus the
 * `ENTITY_TYPES` discriminator set and the generated row schemas. A table
 * rename or a dropped column here breaks migrations in core, finance and
 * food simultaneously, so the assertions are deliberately strict.
 */
import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  aiInferenceLog,
  aiInferenceLogRowSchema,
  entities,
  entitiesRowSchema,
  ENTITY_TYPES,
} from '../index.js';

describe('@pops/shared-schema', () => {
  it.each([
    [entities, 'entities'],
    [aiInferenceLog, 'ai_inference_log'],
  ])('resolves %#: %s', (table, expectedName) => {
    expect(getTableName(table)).toBe(expectedName);
  });

  it('pins the entities columns', () => {
    expect(Object.keys(getTableColumns(entities)).toSorted()).toEqual(
      [
        'id',
        'notionId',
        'name',
        'type',
        'abn',
        'aliases',
        'defaultTransactionType',
        'defaultTags',
        'notes',
        'lastEditedTime',
        'ownerUri',
        'ownerUriStaleAt',
      ].toSorted()
    );
  });

  it('pins the ai_inference_log columns', () => {
    expect(Object.keys(getTableColumns(aiInferenceLog)).toSorted()).toEqual(
      [
        'id',
        'provider',
        'model',
        'operation',
        'domain',
        'inputTokens',
        'outputTokens',
        'costUsd',
        'latencyMs',
        'status',
        'cached',
        'contextId',
        'errorMessage',
        'metadata',
        'createdAt',
      ].toSorted()
    );
  });

  it('pins the ENTITY_TYPES discriminator set', () => {
    expect([...ENTITY_TYPES]).toEqual([
      'company',
      'person',
      'government',
      'bank',
      'place',
      'brand',
      'organisation',
    ]);
  });

  it('derives row schemas from the tables', () => {
    expect(
      entitiesRowSchema.parse({
        id: 'e1',
        notionId: null,
        name: 'Acme',
        type: 'company',
        abn: null,
        aliases: null,
        defaultTransactionType: null,
        defaultTags: null,
        notes: null,
        lastEditedTime: '2024-01-01T00:00:00.000Z',
        ownerUri: null,
        ownerUriStaleAt: null,
      }).name
    ).toBe('Acme');

    expect(
      aiInferenceLogRowSchema.parse({
        id: 1,
        provider: 'anthropic',
        model: 'claude',
        operation: 'classify',
        domain: null,
        inputTokens: 10,
        outputTokens: 5,
        costUsd: 0.01,
        latencyMs: 120,
        status: 'success',
        cached: 0,
        contextId: null,
        errorMessage: null,
        metadata: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      }).provider
    ).toBe('anthropic');
  });
});
