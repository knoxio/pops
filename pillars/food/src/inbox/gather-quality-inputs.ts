/**
 * Batched gatherer feeding the quality heuristic — see
 * pillars/food/docs/prds/quality-heuristic.
 *
 * Returns the `QualityInputs` for each input versionId via a fixed-size set
 * of DB round-trips (no N+1 — the inbox queue depends on this).
 *
 * **State derivation is DB-only.** This helper derives `ingestState` from
 * the source row alone; it can't observe the live processing-vs-pending
 * distinction, and the heuristic only cares about the
 * `completed/failed/partial` terminal trio plus a generic `processing`
 * for everything else. The simplification is safe: rows that are still
 * in-flight get `processing`, never `failed`, so the COMPILE-failed
 * branches don't fire against work that's merely incomplete.
 */
import { count, inArray, isNotNull } from 'drizzle-orm';

import { ingestSources } from '../db/schema.js';
import { recipeLines, recipeSteps, recipeVersionProposedSlugs } from '../db/schema.js';
import { recipeVersions } from '../db/schema.js';
import { countCreationsForVersions } from '../db/services/creations.js';
import { type FoodDb } from '../db/services/internal.js';
import { extractPartialReasonFromExtractedJson } from './partial-reason.js';
import {
  type CompileStatus,
  type IngestKind,
  type IngestState,
  type QualityInputs,
} from './quality.js';

import type { PartialReason } from '../contract/queue/index.js';

interface VersionRow {
  id: number;
  sourceId: number | null;
  compileStatus: CompileStatus;
  compileError: string | null;
  title: string;
  yieldQty: number | null;
}

interface SourceRow {
  id: number;
  kind: IngestKind;
  extractedJson: string | null;
  draftRecipeId: number | null;
  ingestedAt: string;
  errorCode: string | null;
  errorMessage: string | null;
}

/**
 * Returns a Map keyed by versionId. Versions whose row doesn't exist are
 * omitted from the result — callers should treat missing keys as "not
 * resolvable" and skip the row.
 */
export function gatherQualityInputsForVersions(
  db: FoodDb,
  versionIds: readonly number[],
  now: Date = new Date()
): Map<number, QualityInputs> {
  const out = new Map<number, QualityInputs>();
  if (versionIds.length === 0) return out;

  const versions = readVersions(db, versionIds);
  if (versions.length === 0) return out;
  const sources = readSources(db, sourceIdsFrom(versions));
  const lineCounts = readLineCounts(db, versions);
  const stepCounts = readStepCounts(db, versions);
  const slugCounts = readSlugCounts(db, versions);
  // `countCreationsForVersions` does the window scan once across
  // slug_registry + ingredient_variants for the entire batch, keeping
  // round-trips O(1) in the batch size.
  const creationCounts = countCreationsForVersions(
    db,
    versions.map((v) => v.id)
  );

  for (const v of versions) {
    const source = v.sourceId !== null ? sources.get(v.sourceId) : undefined;
    out.set(
      v.id,
      assembleInputs({
        version: v,
        source,
        lineCount: lineCounts.get(v.id) ?? 0,
        stepCount: stepCounts.get(v.id) ?? 0,
        slugCount: slugCounts.get(v.id) ?? 0,
        creationCount: creationCounts.get(v.id) ?? 0,
        now,
      })
    );
  }
  return out;
}

function readVersions(db: FoodDb, versionIds: readonly number[]): VersionRow[] {
  return db
    .select({
      id: recipeVersions.id,
      sourceId: recipeVersions.sourceId,
      compileStatus: recipeVersions.compileStatus,
      compileError: recipeVersions.compileError,
      title: recipeVersions.title,
      yieldQty: recipeVersions.yieldQty,
    })
    .from(recipeVersions)
    .where(inArray(recipeVersions.id, [...versionIds]))
    .all();
}

function sourceIdsFrom(versions: readonly VersionRow[]): number[] {
  const ids = versions.map((v) => v.sourceId).filter((id): id is number => id !== null);
  return [...new Set(ids)];
}

function readSources(db: FoodDb, sourceIds: readonly number[]): Map<number, SourceRow> {
  if (sourceIds.length === 0) return new Map();
  const rows = db
    .select({
      id: ingestSources.id,
      kind: ingestSources.kind,
      extractedJson: ingestSources.extractedJson,
      draftRecipeId: ingestSources.draftRecipeId,
      ingestedAt: ingestSources.ingestedAt,
      errorCode: ingestSources.errorCode,
      errorMessage: ingestSources.errorMessage,
    })
    .from(ingestSources)
    .where(inArray(ingestSources.id, [...sourceIds]))
    .all();
  return new Map(rows.map((r) => [r.id, r as SourceRow]));
}

function readLineCounts(db: FoodDb, versions: readonly VersionRow[]): Map<number, number> {
  return readCountsBy(db, recipeLines, 'recipeVersionId', versions);
}

function readStepCounts(db: FoodDb, versions: readonly VersionRow[]): Map<number, number> {
  return readCountsBy(db, recipeSteps, 'recipeVersionId', versions);
}

function readSlugCounts(db: FoodDb, versions: readonly VersionRow[]): Map<number, number> {
  return readCountsBy(db, recipeVersionProposedSlugs, 'recipeVersionId', versions);
}

type CountableTable = typeof recipeLines | typeof recipeSteps | typeof recipeVersionProposedSlugs;

function readCountsBy(
  db: FoodDb,
  table: CountableTable,
  _column: 'recipeVersionId',
  versions: readonly VersionRow[]
): Map<number, number> {
  const versionIds = versions.map((v) => v.id);
  if (versionIds.length === 0) return new Map();
  const rows = db
    .select({ versionId: table.recipeVersionId, n: count() })
    .from(table)
    .where(inArray(table.recipeVersionId, versionIds))
    .groupBy(table.recipeVersionId)
    .all() as readonly { versionId: number; n: number }[];
  return new Map(rows.map((r) => [r.versionId, r.n]));
}

interface AssembleArgs {
  version: VersionRow;
  source: SourceRow | undefined;
  lineCount: number;
  stepCount: number;
  slugCount: number;
  creationCount: number;
  now: Date;
}

function assembleInputs(args: AssembleArgs): QualityInputs {
  const { version, source } = args;
  const partialReason = source
    ? extractPartialReasonFromExtractedJson(source.extractedJson)
    : undefined;
  return {
    ingestKind: source?.kind ?? 'url-web',
    ingestState: deriveDbOnlyState(source, partialReason),
    partialReason,
    ingestAgeMinutes: ageMinutes(source?.ingestedAt, args.now),
    compileStatus: version.compileStatus,
    compileErrorCount: parseCompileErrorCount(version.compileError),
    proposedSlugCount: args.slugCount,
    creationCount: args.creationCount,
    ingredientLineCount: args.lineCount,
    stepCount: args.stepCount,
    hasTitle: version.title.trim().length > 0,
    hasYield: version.yieldQty !== null,
  };
}

function deriveDbOnlyState(
  source: SourceRow | undefined,
  partialReason: PartialReason | undefined
): IngestState {
  if (source === undefined) return 'processing';
  if (source.errorCode !== null || source.errorMessage !== null) return 'failed';
  if (source.draftRecipeId !== null) {
    return partialReason === undefined ? 'completed' : 'partial';
  }
  return 'processing';
}

function ageMinutes(ingestedAt: string | undefined, now: Date): number {
  if (ingestedAt === undefined) return 0;
  // SQLite emits "YYYY-MM-DD HH:MM:SS" (UTC, no `Z`). JSON.parse-safe ISO
  // form needs the `T` separator + explicit Z.
  const iso = ingestedAt.replace(' ', 'T') + (ingestedAt.endsWith('Z') ? '' : 'Z');
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / 60_000));
}

function parseCompileErrorCount(compileError: string | null): number {
  if (compileError === null) return 0;
  try {
    const parsed: unknown = JSON.parse(compileError);
    if (typeof parsed !== 'object' || parsed === null || !('errors' in parsed)) return 0;
    const errors = (parsed as { errors: unknown }).errors;
    return Array.isArray(errors) ? errors.length : 0;
  } catch {
    return 0;
  }
}

export { isNotNull };
