/**
 * Baseline fetcher: given a contract entry, look up the latest
 * `contract-<pillar>@v*` tag in the repo and read the `etc/*.api.json`
 * and `etc/*.zod.json` snapshots from that revision.
 *
 * Returns `null` when no baseline tag exists (initial-version case).
 */
import { execFileSync } from 'node:child_process';

import type { ContractEntry } from './contract-list.js';
import type { TsSurface, ZodSurface } from './types.js';

export interface BaselineSnapshots {
  readonly tag: string;
  readonly version: string;
  readonly tsSurface: TsSurface;
  readonly zodSurface: ZodSurface;
}

function git(args: readonly string[], opts: { cwd: string; allowFailure?: boolean }): string {
  try {
    return execFileSync('git', args, { cwd: opts.cwd, encoding: 'utf8' }).trim();
  } catch (err) {
    if (opts.allowFailure) return '';
    throw err;
  }
}

export function latestBaselineTag(contract: ContractEntry, repoRoot: string): string | null {
  const pattern = `${contract.tagPrefix}*`;
  const lsRemote = git(['tag', '--list', pattern, '--sort=-v:refname'], {
    cwd: repoRoot,
    allowFailure: true,
  });
  const lines = lsRemote.split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  const first = lines[0];
  return first ?? null;
}

export function readFileAtRev(repoRoot: string, rev: string, path: string): string | null {
  try {
    return execFileSync('git', ['show', `${rev}:${path}`], { cwd: repoRoot, encoding: 'utf8' });
  } catch {
    return null;
  }
}

export function loadBaseline(contract: ContractEntry, repoRoot: string): BaselineSnapshots | null {
  const tag = latestBaselineTag(contract, repoRoot);
  if (!tag) return null;

  const apiPath = `${contract.packageDir}/etc/${contract.pillar}-contract.api.json`;
  const zodPath = `${contract.packageDir}/etc/${contract.pillar}-contract.zod.json`;

  const apiRaw = readFileAtRev(repoRoot, tag, apiPath);
  const zodRaw = readFileAtRev(repoRoot, tag, zodPath);

  if (apiRaw === null || zodRaw === null) {
    throw new Error(
      `baseline tag ${tag} does not contain ${apiPath} or ${zodPath}. ` +
        `Either delete the tag or run a one-off resync to backfill snapshots at that revision.`
    );
  }

  const tsSurface = JSON.parse(apiRaw) as TsSurface;
  const zodSurface = JSON.parse(zodRaw) as ZodSurface;
  const version = tag.slice(contract.tagPrefix.length);

  return { tag, version, tsSurface, zodSurface };
}
