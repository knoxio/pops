/**
 * Handler for core's `settings.aggregate` route — the federation aggregator
 * (settings-federation S3; see `docs/plans/02-settings-federation.md` §4.5).
 *
 * `GET /settings/aggregate` is identity-gated (`core.settings.aggregate`) like
 * every other core settings route, then fans out over the live DB registry
 * snapshot: core itself is read in-process; every other registered pillar that
 * advertises the `settings` capability is read over the docker network at
 * `${baseUrl}/settings`, carrying the shared internal token (OD-7). Sensitive
 * values are re-redacted defensively at the aggregator (R12).
 *
 * The in-cluster fan-out cannot forward the browser session, so it presents
 * `x-pops-internal-token: POPS_API_INTERNAL_TOKEN`; pillars that gate their
 * collection read on the internal-token alias accept it, pillars that trust the
 * docker network ignore it. An unreachable / 401 pillar degrades to an empty
 * slice with an `error` tag rather than failing the whole call.
 */
import { listEffective, redactSensitive } from '@pops/pillar-settings';

import { coreKeyDefaults } from '../../contract/settings/key-defaults.js';
import { type CoreDb } from '../../db/index.js';
import { type Principal, readPrincipal, requireProtected } from '../middleware/identity.js';
import { buildRegistrySnapshot } from '../modules/registry/snapshot.js';
import {
  aggregateSettings,
  type AggregateTarget,
  type SettingsAggregate,
} from '../settings/aggregate-settings.js';
import { type MappedHttpError, runHttp } from './error-mapping.js';

import type { Response } from 'express';

const SELF_PILLAR_ID = 'registry';
const AGGREGATE_SCOPE = 'core.settings.aggregate';

type AggregateResult = { status: 200; body: SettingsAggregate } | MappedHttpError;
type AggregateHandler = (args: { res: Response }) => Promise<AggregateResult>;

const coreSensitive = new Set(coreKeyDefaults.sensitive);

/** Reads core's own effective settings in-process, sensitive redacted. */
function readSelfSettings(db: CoreDb): ReturnType<typeof listEffective> {
  return redactSensitive(listEffective(db, coreKeyDefaults), coreSensitive);
}

/** Project the live registry snapshot onto the aggregator's fan-out targets. */
function snapshotTargets(db: CoreDb): AggregateTarget[] {
  return buildRegistrySnapshot(db).pillars.map((entry) => ({
    pillarId: entry.pillarId,
    baseUrl: entry.baseUrl,
    manifest: entry.manifest,
    ...(entry.capabilities === undefined ? {} : { capabilities: entry.capabilities }),
  }));
}

export function makeSettingsAggregateHandler(db: CoreDb): AggregateHandler {
  return ({ res }) =>
    runHttp(async () => {
      const principal: Principal = readPrincipal(res);
      requireProtected(principal, AGGREGATE_SCOPE);
      const internalToken = process.env['POPS_API_INTERNAL_TOKEN'];
      const aggregate = await aggregateSettings(snapshotTargets(db), {
        selfPillarId: SELF_PILLAR_ID,
        readSelf: () => readSelfSettings(db),
        ...(internalToken === undefined ? {} : { internalToken }),
      });
      return { status: 200 as const, body: aggregate };
    });
}
