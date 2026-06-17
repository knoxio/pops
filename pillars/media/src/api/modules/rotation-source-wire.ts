/**
 * Rotation source row → wire-shape mappers (api-layer).
 *
 * The db layer stores `enabled` as an integer and `config` as opaque JSON
 * text; the wire surface exposes a boolean + a parsed object. Kept out of the
 * handler files so they stay within the per-file line cap.
 */
import type { RotationSourceRow, SourceWithCount } from '../../db/index.js';

export interface SourceWire {
  id: number;
  type: string;
  name: string;
  priority: number;
  enabled: boolean;
  config: Record<string, unknown>;
  lastSyncedAt: string | null;
  syncIntervalHours: number;
  createdAt: string;
}

export interface SourceWithCountWire extends SourceWire {
  candidateCount: number;
}

function parseConfig(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function toSourceWire(row: RotationSourceRow): SourceWire {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    priority: row.priority,
    enabled: row.enabled === 1,
    config: parseConfig(row.config),
    lastSyncedAt: row.lastSyncedAt,
    syncIntervalHours: row.syncIntervalHours,
    createdAt: row.createdAt,
  };
}

export function toSourceWithCountWire(row: SourceWithCount): SourceWithCountWire {
  return { ...toSourceWire(row), candidateCount: row.candidateCount };
}
