/**
 * Tiny semver helpers — we only need parsing, comparison and bumping by
 * level. Avoid pulling in `semver` (extra runtime dep, mostly geared at
 * range parsing we do not use). All inputs are strict `X.Y.Z` triples;
 * pre-release suffixes are rejected — contract packages never ship
 * pre-releases (see ADR-030).
 */
import type { Classification, SemverParts } from './types.js';

const STRICT = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(version: string): SemverParts {
  const match = STRICT.exec(version);
  if (!match) {
    throw new Error(`invalid semver "${version}" — expected strict X.Y.Z`);
  }
  const [, major, minor, patch] = match;
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
  };
}

export function stringifySemver(parts: SemverParts): string {
  return `${parts.major}.${parts.minor}.${parts.patch}`;
}

export function compareSemver(a: SemverParts, b: SemverParts): -1 | 0 | 1 {
  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

export function bump(baseline: SemverParts, classification: Classification): SemverParts {
  switch (classification) {
    case 'none':
      return baseline;
    case 'patch':
      return { major: baseline.major, minor: baseline.minor, patch: baseline.patch + 1 };
    case 'minor':
      return { major: baseline.major, minor: baseline.minor + 1, patch: 0 };
    case 'major':
      return { major: baseline.major + 1, minor: 0, patch: 0 };
  }
}

export function classifyBump(baseline: SemverParts, current: SemverParts): Classification {
  if (current.major > baseline.major) return 'major';
  if (current.major < baseline.major) {
    throw new Error(
      `current version ${stringifySemver(current)} is below baseline ${stringifySemver(baseline)}; downgrades are not allowed`
    );
  }
  if (current.minor > baseline.minor) return 'minor';
  if (current.minor < baseline.minor) {
    throw new Error(
      `current version ${stringifySemver(current)} regresses the minor component below baseline ${stringifySemver(baseline)}`
    );
  }
  if (current.patch > baseline.patch) return 'patch';
  if (current.patch < baseline.patch) {
    throw new Error(
      `current version ${stringifySemver(current)} regresses the patch component below baseline ${stringifySemver(baseline)}`
    );
  }
  return 'none';
}
