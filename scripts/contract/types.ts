/**
 * Shared types for the contract semver pipeline (PRD-154).
 *
 * Snapshots are committed JSON files in `etc/<pillar>-contract.api.json`
 * and `etc/<pillar>-contract.zod.json`. Diffs are computed against the
 * baseline tag's snapshots and classified into the verdicts below.
 */
export type DiffKind = 'none' | 'additive' | 'breaking';

export type Classification = 'none' | 'patch' | 'minor' | 'major';

export type Verdict =
  | 'pass-no-change'
  | 'pass-additive-noop'
  | 'pass-bumped-correctly'
  | 'pass-initial-version'
  | 'pass-no-consumers'
  | 'fail-bump-required'
  | 'fail-bump-too-small'
  | 'fail-bump-too-large'
  | 'fail-migration-section-missing'
  | 'fail-snapshot-stale'
  | 'fail-baseline-missing-on-tag';

export interface TsSurfaceEntry {
  readonly entry: string;
  readonly name: string;
  readonly kind:
    | 'interface'
    | 'type'
    | 'function'
    | 'class'
    | 'enum'
    | 'variable'
    | 'namespace'
    | 'reexport';
  readonly text: string;
}

export interface TsSurface {
  readonly contract: string;
  readonly version: string;
  readonly entries: readonly TsSurfaceEntry[];
}

export interface ZodSurfaceEntry {
  readonly name: string;
  readonly schema: unknown;
}

export interface ZodSurface {
  readonly contract: string;
  readonly version: string;
  readonly entries: readonly ZodSurfaceEntry[];
}

export interface SurfaceDiff {
  readonly kind: DiffKind;
  readonly added: readonly string[];
  readonly removed: readonly string[];
  readonly changed: readonly ChangedEntry[];
}

export interface ChangedEntry {
  readonly name: string;
  readonly breaking: boolean;
  readonly reason: string;
}

export interface SemverParts {
  readonly major: number;
  readonly minor: number;
  readonly patch: number;
}

export interface DiffReport {
  readonly contract: string;
  readonly baselineTag: string | null;
  readonly baselineVersion: string | null;
  readonly currentVersion: string;
  readonly tsDiff: SurfaceDiff;
  readonly zodDiff: SurfaceDiff;
  readonly classification: Classification;
  readonly requiredVersion: string;
  readonly verdict: Verdict;
  readonly reason: string;
}
