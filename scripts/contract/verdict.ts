/**
 * Verdict computation: given two diffs and the baseline / current
 * versions, produce a `Verdict` and a human-readable reason. Pure
 * function of its inputs — the orchestrator (`diff-contract.ts`)
 * gathers the snapshots and calls in here.
 */
import { bump, classifyBump, compareSemver, parseSemver, stringifySemver } from './semver.js';

import type { Classification, SurfaceDiff, Verdict } from './types.js';

export interface VerdictInputs {
  readonly baselineVersion: string | null;
  readonly currentVersion: string;
  readonly tsDiff: SurfaceDiff;
  readonly zodDiff: SurfaceDiff;
}

export interface VerdictOutput {
  readonly classification: Classification;
  readonly requiredVersion: string;
  readonly verdict: Verdict;
  readonly reason: string;
}

function combineClassification(ts: SurfaceDiff, zod: SurfaceDiff): Classification {
  if (ts.kind === 'breaking' || zod.kind === 'breaking') return 'major';
  if (ts.kind === 'additive' || zod.kind === 'additive') return 'minor';
  return 'none';
}

export function classifyDiffs(ts: SurfaceDiff, zod: SurfaceDiff): Classification {
  return combineClassification(ts, zod);
}

export function computeVerdict(input: VerdictInputs): VerdictOutput {
  const classification = combineClassification(input.tsDiff, input.zodDiff);

  if (input.baselineVersion === null) {
    return {
      classification,
      requiredVersion: input.currentVersion,
      verdict: 'pass-initial-version',
      reason: 'no baseline tag found — this PR establishes the initial baseline.',
    };
  }

  const baseline = parseSemver(input.baselineVersion);
  const current = parseSemver(input.currentVersion);
  const required = bump(baseline, classification);
  const requiredString = stringifySemver(required);

  const bumpLevel = classifyBump(baseline, current);

  if (classification === 'none') {
    if (compareSemver(current, baseline) === 0) {
      return {
        classification,
        requiredVersion: requiredString,
        verdict: 'pass-no-change',
        reason: 'no surface diff detected; version unchanged.',
      };
    }
    return {
      classification,
      requiredVersion: requiredString,
      verdict: 'pass-no-change',
      reason: `no surface diff detected but version bumped to ${input.currentVersion}; consider not bumping.`,
    };
  }

  if (compareSemver(current, baseline) === 0) {
    return {
      classification,
      requiredVersion: requiredString,
      verdict: 'fail-bump-required',
      reason: `${classification} changes detected but version was not bumped (still ${input.currentVersion}). bump to ${requiredString}.`,
    };
  }

  const requiredLevel = classificationRank(classification);
  const declaredLevel = classificationRank(bumpLevel);

  if (declaredLevel < requiredLevel) {
    return {
      classification,
      requiredVersion: requiredString,
      verdict: 'fail-bump-too-small',
      reason: `detected ${classification} change but version was bumped only ${bumpLevel}; bump to ${requiredString}.`,
    };
  }
  if (declaredLevel > requiredLevel) {
    return {
      classification,
      requiredVersion: requiredString,
      verdict: 'fail-bump-too-large',
      reason: `${bumpLevel} bump declared but only ${classification} would suffice; consider ${requiredString} instead of ${input.currentVersion}.`,
    };
  }

  return {
    classification,
    requiredVersion: requiredString,
    verdict: 'pass-bumped-correctly',
    reason: `version bump to ${input.currentVersion} matches the detected ${classification} change.`,
  };
}

function classificationRank(c: Classification): number {
  switch (c) {
    case 'none':
      return 0;
    case 'patch':
      return 1;
    case 'minor':
      return 2;
    case 'major':
      return 3;
  }
}
