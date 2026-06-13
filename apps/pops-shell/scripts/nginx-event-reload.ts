/**
 * Event-driven nginx regen + reload (Theme 13 PRD-228 US-03).
 *
 * Subscribes to the registry SSE event bus (PRD-163) and, on each
 * `pillar.registered` / `pillar.deregistered` / `pillar.health-changed`
 * frame, regenerates the dynamic dispatcher conf and signals nginx to
 * reload. A trailing 250ms debounce coalesces bursts (multi-pillar
 * boot, eviction-storms during reconciliation) into a single regen +
 * reload.
 *
 * The module is split from the long-running CLI entrypoint so the
 * orchestration (debounce, error handling, dispatch) can be unit-tested
 * without opening a real network connection.
 *
 * Contract — `regenerate()` MUST resolve once the new conf has been
 * written. `reload()` MUST resolve once nginx has been signalled. Either
 * may reject; rejections are surfaced through the optional `logger`
 * but never propagate out of `trigger()` (the watcher must stay up).
 * `nginx -t` validation lives inside the caller-supplied `reload` so
 * the watcher stays transport-agnostic (in-container nginx vs sidecar
 * vs SIGHUP to a docker container).
 */

export type WatchedEventName =
  | 'pillar.registered'
  | 'pillar.deregistered'
  | 'pillar.health-changed';

export const WATCHED_EVENTS: readonly WatchedEventName[] = [
  'pillar.registered',
  'pillar.deregistered',
  'pillar.health-changed',
];

export function isWatchedEvent(name: string): name is WatchedEventName {
  return (WATCHED_EVENTS as readonly string[]).includes(name);
}

export interface ReloadLogger {
  readonly info: (message: string) => void;
  readonly error: (message: string, error?: unknown) => void;
}

export interface CreateReloadHandlerOptions {
  readonly regenerate: () => Promise<void>;
  readonly reload: () => Promise<void>;
  readonly debounceMs?: number;
  readonly logger?: ReloadLogger;
  readonly setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer?: (handle: ReturnType<typeof setTimeout>) => void;
}

export interface ReloadHandler {
  readonly trigger: (event: WatchedEventName) => void;
  readonly flush: () => Promise<void>;
  readonly stop: () => void;
}

interface PendingRun {
  readonly events: WatchedEventName[];
}

const DEFAULT_DEBOUNCE_MS = 250;

const NOOP_LOGGER: ReloadLogger = {
  info: () => undefined,
  error: () => undefined,
};

interface HandlerState {
  pending: PendingRun | null;
  timer: ReturnType<typeof setTimeout> | null;
  inflight: Promise<void> | null;
  stopped: boolean;
  readonly debounceMs: number;
  readonly logger: ReloadLogger;
  readonly setTimer: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  readonly clearTimer: (handle: ReturnType<typeof setTimeout>) => void;
  readonly regenerate: () => Promise<void>;
  readonly reload: () => Promise<void>;
}

function scheduleRun(state: HandlerState): void {
  if (state.timer !== null) state.clearTimer(state.timer);
  state.timer = state.setTimer(() => {
    state.timer = null;
    void startRun(state);
  }, state.debounceMs);
}

async function startRun(state: HandlerState): Promise<void> {
  if (state.stopped) return;
  if (state.inflight !== null) {
    await state.inflight;
    if (state.pending !== null && !state.stopped) scheduleRun(state);
    return;
  }
  if (state.pending === null) return;
  const run = state.pending;
  state.pending = null;
  state.inflight = executeRun(state, run);
  try {
    await state.inflight;
  } finally {
    state.inflight = null;
    if (state.pending !== null && !state.stopped) scheduleRun(state);
  }
}

async function executeRun(state: HandlerState, run: PendingRun): Promise<void> {
  state.logger.info(`nginx-event-reload: regen triggered by [${run.events.join(',')}]`);
  try {
    await state.regenerate();
  } catch (err: unknown) {
    state.logger.error('nginx-event-reload: regenerate failed; skipping reload', err);
    return;
  }
  try {
    await state.reload();
    state.logger.info('nginx-event-reload: reload signalled');
  } catch (err: unknown) {
    state.logger.error('nginx-event-reload: reload failed', err);
  }
}

/**
 * Build a trailing-debounced reload handler. Multiple `trigger()` calls
 * within `debounceMs` collapse into one regen + reload run; the run
 * starts after the window closes. `flush()` is exposed for tests that
 * want to await the in-flight (or queued) run deterministically. While
 * a regen+reload is in flight, additional triggers queue another run
 * that fires once the current one finishes (so we never miss an event
 * that landed mid-regen).
 */
export function createReloadHandler(options: CreateReloadHandlerOptions): ReloadHandler {
  const state: HandlerState = {
    pending: null,
    timer: null,
    inflight: null,
    stopped: false,
    debounceMs: options.debounceMs ?? DEFAULT_DEBOUNCE_MS,
    logger: options.logger ?? NOOP_LOGGER,
    setTimer: options.setTimer ?? setTimeout,
    clearTimer: options.clearTimer ?? clearTimeout,
    regenerate: options.regenerate,
    reload: options.reload,
  };
  return {
    trigger: (event: WatchedEventName) => {
      if (state.stopped) return;
      if (state.pending === null) state.pending = { events: [event] };
      else state.pending.events.push(event);
      scheduleRun(state);
    },
    flush: async () => {
      if (state.timer !== null) {
        state.clearTimer(state.timer);
        state.timer = null;
        await startRun(state);
      }
      let inflight = state.inflight;
      while (inflight !== null) {
        await inflight;
        inflight = state.inflight;
      }
    },
    stop: () => {
      state.stopped = true;
      if (state.timer !== null) {
        state.clearTimer(state.timer);
        state.timer = null;
      }
      state.pending = null;
    },
  };
}
