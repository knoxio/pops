/**
 * Frame parsing + state-object → mirror-input conversion helpers for the
 * HA WebSocket subscriber. Extracted from `ws-subscriber.ts` so the
 * subscriber class stays focused on the connection state machine and
 * the per-file complexity budget keeps room for US-02 expansions.
 */
import type { HaEntityMirrorInput } from '@pops/ha-bridge-db';

export interface HaFrame {
  id?: number;
  type?: string;
  success?: boolean;
  message?: string;
  result?: unknown;
  event?: {
    event_type?: string;
    data?: {
      entity_id?: string;
      new_state?: HaStateObject | null;
    };
  };
}

export interface HaStateObject {
  entity_id?: string;
  state?: string;
  last_changed?: string;
  last_updated?: string;
  attributes?: Record<string, unknown>;
}

export function parseFrame(raw: unknown): HaFrame | undefined {
  const text = toJsonText(raw);
  if (text === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed !== null && typeof parsed === 'object') return parsed as HaFrame;
  } catch {
    return undefined;
  }
  return undefined;
}

function toJsonText(raw: unknown): string | undefined {
  if (typeof raw === 'string') return raw;
  if (raw instanceof Buffer) return raw.toString('utf8');
  return undefined;
}

export function stateObjectToMirrorInput(
  state: HaStateObject,
  lastSeenMs: number
): HaEntityMirrorInput | undefined {
  if (state.entity_id === undefined || state.state === undefined) return undefined;
  const lastChangedRaw = state.last_changed ?? state.last_updated;
  const lastChanged = lastChangedRaw !== undefined ? Date.parse(lastChangedRaw) : lastSeenMs;
  const attributes = state.attributes ?? {};
  const area = readArea(attributes);
  return {
    entityId: state.entity_id,
    state: state.state,
    attributes,
    area,
    lastChanged: Number.isFinite(lastChanged) ? lastChanged : lastSeenMs,
    lastSeen: lastSeenMs,
  };
}

function readArea(attributes: Record<string, unknown>): string | null {
  const fromAttr = attributes['area'];
  if (typeof fromAttr === 'string' && fromAttr.length > 0) return fromAttr;
  const fromAreaName = attributes['area_name'];
  if (typeof fromAreaName === 'string' && fromAreaName.length > 0) return fromAreaName;
  return null;
}
