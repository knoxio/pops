/**
 * Boot-time registry reconciliation (Theme 13 PRD-164).
 *
 * When `pops-core-api` restarts, the persisted `pillar_registry` rows
 * survive but their `lastHeartbeatAt` is stale relative to the new boot
 * clock. The persisted `status` cache is equally stale — a row last
 * written as `healthy` may correspond to a pillar that died during the
 * outage.
 *
 * This module reconciles that gap before the HTTP server starts
 * accepting traffic. For every existing row:
 *
 *   - If `now - lastHeartbeatAt > UNAVAILABLE_AFTER_MS`, the pillar
 *     missed at least the standard threshold of heartbeats during the
 *     outage. We set `status = 'unknown'` (NOT `unavailable` — we don't
 *     *know* it's down, we just observed a missed heartbeat). The
 *     PRD-162 heartbeat ticker takes over from here: a heartbeat from
 *     the pillar will flip it back to `healthy`; continued silence
 *     will eventually compute `unavailable` via the lazy-status path.
 *
 *   - If `now - lastHeartbeatAt <= UNAVAILABLE_AFTER_MS`, the row is
 *     within the live threshold and is left as-is. The pillar's next
 *     heartbeat (due within ~10s) refreshes the row normally.
 *
 * The function is idempotent: re-running it on the same data produces
 * the same result. Tests simulate restart by calling it explicitly.
 *
 * Single-instance assumption per ADR-027. Multi-region / multi-instance
 * reconciliation is a follow-up (see PRD-164 "Out of Scope").
 */
import {
  pillarRegistryService,
  type ApplyStatusUpdate,
  type CoreDb,
  type PillarRegistration,
  type StatusTransition,
} from '@pops/core-db';

import { UNAVAILABLE_AFTER_MS, registryNow } from './status.js';

export interface ReconcileOnBootOptions {
  readonly now?: Date;
  readonly staleThresholdMs?: number;
  readonly onTransition?: (transition: StatusTransition) => void;
  readonly logger?: (message: string) => void;
}

/**
 * Run a single boot-time reconciliation pass.
 *
 * Returns the transitions that were persisted so the caller (and tests)
 * can assert on the result without subscribing via `onTransition`.
 */
export function reconcileRegistryOnBoot(
  db: CoreDb,
  options?: ReconcileOnBootOptions
): readonly StatusTransition[] {
  const now = options?.now ?? registryNow();
  const nowIso = now.toISOString();
  const threshold = options?.staleThresholdMs ?? UNAVAILABLE_AFTER_MS;
  const log = options?.logger ?? ((message: string): void => console.warn(message));

  const rows = pillarRegistryService.listPillarRegistrations(db);
  const { updates, transitions } = planBootTransitions(rows, now, nowIso, threshold);

  pillarRegistryService.applyStatusUpdates(db, updates);

  log(
    `[core-api] boot reconciliation: ${rows.length} pillar(s) inspected, ` +
      `${transitions.length} marked unknown (stale heartbeat > ${threshold}ms)`
  );

  if (options?.onTransition) {
    for (const transition of transitions) {
      options.onTransition(transition);
    }
  }

  return transitions;
}

function planBootTransitions(
  rows: readonly PillarRegistration[],
  now: Date,
  nowIso: string,
  thresholdMs: number
): { updates: ApplyStatusUpdate[]; transitions: StatusTransition[] } {
  const updates: ApplyStatusUpdate[] = [];
  const transitions: StatusTransition[] = [];
  for (const row of rows) {
    const ageMs = now.getTime() - Date.parse(row.lastHeartbeatAt);
    if (ageMs <= thresholdMs) continue;
    if (row.status === 'unknown') continue;
    updates.push({ pillarId: row.pillarId, status: 'unknown', statusUpdatedAt: nowIso });
    transitions.push({
      pillarId: row.pillarId,
      previousStatus: row.status,
      nextStatus: 'unknown',
      at: nowIso,
    });
  }
  return { updates, transitions };
}
