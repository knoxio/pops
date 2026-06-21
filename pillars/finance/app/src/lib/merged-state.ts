import { applyChangeSetToRules, correctionToRow, toCorrection } from '@pops/finance';

import type { Correction, CorrectionRow, Entity } from '@pops/finance';

import type { PendingChangeSet, PendingEntity } from '../store/importStore';

// ---------------------------------------------------------------------------
// computeMergedRules — PRD-030 US-03
// ---------------------------------------------------------------------------

let _cachedRulesInput: { dbRules: Correction[]; pending: PendingChangeSet[] } | null = null;
let _cachedRulesOutput: Correction[] | null = null;

/**
 * Fold `applyChangeSetToRules` over each pending ChangeSet in insertion order,
 * starting from the DB rules as the base. Memoized by reference equality on
 * both input arrays.
 *
 * Operates on the API `Correction` shape (tags: string[]) at the boundary so
 * the frontend never has to juggle the DB's JSON-encoded tags string.
 */
export function computeMergedRules(
  dbRules: Correction[],
  pendingChangeSets: PendingChangeSet[]
): Correction[] {
  // Memoization: same input refs → same output ref
  if (
    _cachedRulesInput &&
    _cachedRulesInput.dbRules === dbRules &&
    _cachedRulesInput.pending === pendingChangeSets &&
    _cachedRulesOutput
  ) {
    return _cachedRulesOutput;
  }

  let result: Correction[];

  if (pendingChangeSets.length === 0) {
    result = dbRules;
  } else {
    const baseRows = dbRules.map(correctionToRow);
    const mergedRows = pendingChangeSets.reduce<CorrectionRow[]>(
      (acc, pcs) => applyChangeSetToRules(acc, pcs.changeSet),
      baseRows
    );
    result = mergedRows.map(toCorrection);
  }

  _cachedRulesInput = { dbRules, pending: pendingChangeSets };
  _cachedRulesOutput = result;
  return result;
}

// ---------------------------------------------------------------------------
// computeMergedEntities — PRD-030 US-04
// ---------------------------------------------------------------------------

let _cachedEntitiesInput: { dbEntities: Entity[]; pending: PendingEntity[] } | null = null;
let _cachedEntitiesOutput: Entity[] | null = null;

/**
 * Adapt pending entities to the `Entity` interface and merge them with DB
 * entities. When a pending entity's name matches a DB entity's name
 * (case-insensitive), the pending version replaces the DB entry.
 * The merged list is sorted alphabetically by name (case-insensitive) so
 * newly-added pending entities appear in their natural position rather than
 * appended at the end.
 * Memoized by reference equality on both input arrays.
 */
export function computeMergedEntities(
  dbEntities: Entity[],
  pendingEntities: PendingEntity[]
): Entity[] {
  // Memoization: same input refs → same output ref
  if (
    _cachedEntitiesInput &&
    _cachedEntitiesInput.dbEntities === dbEntities &&
    _cachedEntitiesInput.pending === pendingEntities &&
    _cachedEntitiesOutput
  ) {
    return _cachedEntitiesOutput;
  }

  if (pendingEntities.length === 0) {
    // DB list is already sorted server-side; nothing to merge in.
    _cachedEntitiesInput = { dbEntities, pending: pendingEntities };
    _cachedEntitiesOutput = dbEntities;
    return dbEntities;
  }

  const byName = (a: Entity, b: Entity) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

  // Build a set of pending entity names (lowercased) for collision detection
  const pendingNameSet = new Set(pendingEntities.map((pe) => pe.name.toLowerCase()));

  // Map pending entities to the consumable Entity shape (id + name + aliases +
  // lastEditedTime). The merged list feeds the rule-form entity picker, which
  // references entities by id/name only.
  const adaptedPending: Entity[] = pendingEntities.map((pe) => ({
    id: pe.tempId,
    name: pe.name,
    aliases: [],
    lastEditedTime: new Date().toISOString(),
  }));

  // Filter out DB entities that collide with pending entities
  const filteredDb = dbEntities.filter((e) => !pendingNameSet.has(e.name.toLowerCase()));

  // Merge then sort alphabetically by name so pending entities slot in by name
  // instead of being appended at the end.
  const result = [...filteredDb, ...adaptedPending].toSorted(byName);

  _cachedEntitiesInput = { dbEntities, pending: pendingEntities };
  _cachedEntitiesOutput = result;
  return result;
}
