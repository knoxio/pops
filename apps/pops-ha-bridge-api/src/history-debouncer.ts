/**
 * Per-entity 200ms debounce for `ha_state_history` writes (PRD-229
 * § Business Rules — State-change debouncing). Extracted from
 * `ws-subscriber.ts` so the connection state machine and the buffering
 * mechanic can be reviewed / tested independently.
 *
 * Behaviour: the first state-change for an entity arms a timer for
 * `debounceMs`. Subsequent state-changes for the same entity inside the
 * window replace the buffered observation but do NOT reset the timer —
 * so a hot sensor firing once per ms still drains at a steady cadence.
 * When the timer fires the latest observation is flushed and the entry
 * is removed from the table.
 */
export interface HistoryObservation {
  entityId: string;
  state: string;
  attributes: Record<string, unknown>;
  observedAt: number;
}

export interface HistoryDebouncerOptions {
  debounceMs: number;
  setTimeoutImpl: typeof setTimeout;
  clearTimeoutImpl: typeof clearTimeout;
  flush(observation: HistoryObservation): void;
}

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  latest: HistoryObservation;
}

export class HistoryDebouncer {
  private readonly debounceMs: number;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly clearTimeoutImpl: typeof clearTimeout;
  private readonly flush: (observation: HistoryObservation) => void;
  private readonly pending = new Map<string, Pending>();

  constructor(options: HistoryDebouncerOptions) {
    this.debounceMs = options.debounceMs;
    this.setTimeoutImpl = options.setTimeoutImpl;
    this.clearTimeoutImpl = options.clearTimeoutImpl;
    this.flush = options.flush;
  }

  observe(observation: HistoryObservation): void {
    const existing = this.pending.get(observation.entityId);
    if (existing !== undefined) {
      existing.latest = observation;
      return;
    }
    const timer = this.setTimeoutImpl(() => {
      const pending = this.pending.get(observation.entityId);
      this.pending.delete(observation.entityId);
      if (pending === undefined) return;
      this.flush(pending.latest);
    }, this.debounceMs);
    this.pending.set(observation.entityId, { timer, latest: observation });
  }

  cancelAll(): void {
    for (const pending of this.pending.values()) {
      this.clearTimeoutImpl(pending.timer);
    }
    this.pending.clear();
  }
}
