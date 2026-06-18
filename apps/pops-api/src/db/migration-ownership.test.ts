/**
 * Contract guard: verifies the static migration ownership map
 * (`migration-ownership.ts`) and each module's
 * `manifest.backend.migrations` agree exhaustively, and that every entry
 * in the drizzle journal is owned by exactly one declared module.
 *
 * The static map is the runtime source of truth (used by `db.ts` during
 * boot without loading the manifest graph); the per-module manifests are
 * the surface every other consumer reads. These tests catch drift between
 * the two before it reaches production.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { manifest as coreManifest } from '../modules/core/index.js';
import { manifest as financeManifest } from '../modules/finance/index.js';
import { manifest as inventoryManifest } from '../modules/inventory/index.js';
import { manifest as listsManifest } from '../modules/lists/index.js';
import { MIGRATION_OWNERS } from './migration-ownership.js';
import { DRIZZLE_MIGRATIONS_DIRECTORY } from './migrations-runner.js';

import type { ModuleManifest } from '@pops/types';

interface Journal {
  entries: { tag: string }[];
}

function readJournalTags(): readonly string[] {
  const journal = JSON.parse(
    readFileSync(join(DRIZZLE_MIGRATIONS_DIRECTORY, 'meta', '_journal.json'), 'utf8')
  ) as Journal;
  return journal.entries.map((e) => e.tag);
}

function manifestTags(manifest: ModuleManifest): readonly string[] {
  return (manifest.backend?.migrations ?? []).map((m) => m.id);
}

describe('migration ownership contract', () => {
  const journalTags = new Set(readJournalTags());

  it('covers every entry in the drizzle journal', () => {
    const declared = new Set(Object.keys(MIGRATION_OWNERS));
    for (const tag of journalTags) {
      expect(declared.has(tag)).toBe(true);
    }
  });

  it('declares no entry that is missing from the journal', () => {
    for (const tag of Object.keys(MIGRATION_OWNERS)) {
      expect(journalTags.has(tag)).toBe(true);
    }
  });

  it('static map matches per-module manifest declarations exhaustively', () => {
    const manifestOwnership = new Map<string, string>();
    for (const m of [coreManifest, financeManifest, listsManifest, inventoryManifest]) {
      for (const tag of manifestTags(m)) {
        expect(manifestOwnership.has(tag)).toBe(false);
        manifestOwnership.set(tag, m.id);
      }
    }

    expect(Object.keys(MIGRATION_OWNERS).toSorted()).toEqual(
      [...manifestOwnership.keys()].toSorted()
    );
    for (const [tag, expectedOwner] of manifestOwnership) {
      expect(MIGRATION_OWNERS[tag]).toBe(expectedOwner);
    }
  });

  it('assigns each tag to exactly one owner', () => {
    const seen = new Set<string>();
    for (const tag of Object.keys(MIGRATION_OWNERS)) {
      expect(seen.has(tag)).toBe(false);
      seen.add(tag);
    }
  });
});
