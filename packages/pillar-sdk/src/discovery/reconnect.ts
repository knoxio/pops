/**
 * SSE reconnection helper for the registry subscription transport
 * (Theme 13 PRD-164).
 *
 * When `pops-core-api` restarts (or any transient network drop), the
 * SSE stream from `GET /registry/subscribe` closes. PRD-163 stops at
 * the server; the client side reconnection is PRD-164's job.
 *
 * Behaviour shipped here — deliberately minimal, not a state machine:
 *   1. Open the SSE stream via the caller-supplied `connect` function.
 *   2. On close, refetch the snapshot once (so the consumer's local
 *      cache is correct even if events were missed during the gap).
 *   3. Reconnect with exponential backoff capped at 30s.
 *
 * The helper does not own the SSE protocol — the caller hands in
 * `connect` and `fetchSnapshot` so unit tests can drive both without
 * a real network. The helper owns the schedule.
 *
 * Single-instance assumption per ADR-027. Multi-region clients are a
 * follow-up — they would need a different transport (likely WebSocket
 * with sticky routing) and live outside this helper.
 */

export const RECONNECT_INITIAL_DELAY_MS = 500;
export const RECONNECT_MAX_DELAY_MS = 30_000;
export const RECONNECT_BACKOFF_FACTOR = 2;

export interface SubscriptionHandle {
  readonly close: () => void;
  readonly onClose: (listener: (reason?: unknown) => void) => () => void;
}

export type ReconnectTimerHandle = ReturnType<typeof setTimeout>;

export interface ReconnectingSubscriptionOptions {
  readonly connect: () => Promise<SubscriptionHandle> | SubscriptionHandle;
  readonly fetchSnapshot: () => Promise<void> | void;
  readonly initialDelayMs?: number;
  readonly maxDelayMs?: number;
  readonly backoffFactor?: number;
  readonly setTimeoutImpl?: (handler: () => void, ms: number) => ReconnectTimerHandle;
  readonly clearTimeoutImpl?: (handle: ReconnectTimerHandle) => void;
  readonly onReconnectScheduled?: (attempt: number, delayMs: number) => void;
  readonly onReconnectError?: (error: unknown) => void;
}

export interface ReconnectingSubscription {
  readonly stop: () => void;
  readonly currentAttempt: () => number;
}

/**
 * Compute the exponential-backoff delay for a given attempt index
 * (1-based). Capped at `maxDelayMs`.
 *
 *   attempt 1 → initialDelayMs
 *   attempt 2 → initialDelayMs * factor
 *   ...
 *   attempt N → min(initialDelayMs * factor^(N-1), maxDelayMs)
 */
export function computeBackoffDelay(
  attempt: number,
  options?: {
    initialDelayMs?: number;
    maxDelayMs?: number;
    backoffFactor?: number;
  }
): number {
  const initial = options?.initialDelayMs ?? RECONNECT_INITIAL_DELAY_MS;
  const max = options?.maxDelayMs ?? RECONNECT_MAX_DELAY_MS;
  const factor = options?.backoffFactor ?? RECONNECT_BACKOFF_FACTOR;
  if (attempt <= 1) return Math.min(initial, max);
  const raw = initial * Math.pow(factor, attempt - 1);
  return Math.min(raw, max);
}

/**
 * Open a self-healing subscription. When the underlying handle closes,
 * the helper refetches the snapshot once and re-invokes `connect` on a
 * capped exponential backoff schedule. `stop()` halts the loop and
 * closes the active handle, if any.
 */
class ReconnectingSubscriptionImpl {
  private stopped = false;
  private attempt = 0;
  private activeHandle: SubscriptionHandle | null = null;
  private pendingTimer: ReconnectTimerHandle | null = null;
  private readonly setTimeoutFn: (handler: () => void, ms: number) => ReconnectTimerHandle;
  private readonly clearTimeoutFn: (handle: ReconnectTimerHandle) => void;

  constructor(private readonly options: ReconnectingSubscriptionOptions) {
    this.setTimeoutFn =
      options.setTimeoutImpl ?? ((handler, ms) => setTimeout(handler, ms) as ReconnectTimerHandle);
    this.clearTimeoutFn = options.clearTimeoutImpl ?? ((handle) => clearTimeout(handle));
  }

  start(): void {
    void this.runConnectCycle();
  }

  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    if (this.pendingTimer !== null) {
      this.clearTimeoutFn(this.pendingTimer);
      this.pendingTimer = null;
    }
    this.activeHandle?.close();
    this.activeHandle = null;
  }

  currentAttempt(): number {
    return this.attempt;
  }

  private scheduleReconnect(): void {
    if (this.stopped) return;
    this.attempt += 1;
    const delayMs = computeBackoffDelay(this.attempt, {
      initialDelayMs: this.options.initialDelayMs,
      maxDelayMs: this.options.maxDelayMs,
      backoffFactor: this.options.backoffFactor,
    });
    this.options.onReconnectScheduled?.(this.attempt, delayMs);
    this.pendingTimer = this.setTimeoutFn(() => {
      this.pendingTimer = null;
      void this.runConnectCycle();
    }, delayMs);
  }

  private handleClose(): void {
    this.activeHandle = null;
    if (this.stopped) return;
    Promise.resolve()
      .then(() => this.options.fetchSnapshot())
      .catch((error: unknown) => this.options.onReconnectError?.(error))
      .finally(() => this.scheduleReconnect());
  }

  private async runConnectCycle(): Promise<void> {
    if (this.stopped) return;
    try {
      const handle = await this.options.connect();
      if (this.stopped) {
        handle.close();
        return;
      }
      this.activeHandle = handle;
      this.attempt = 0;
      handle.onClose(() => this.handleClose());
    } catch (error) {
      this.options.onReconnectError?.(error);
      this.scheduleReconnect();
    }
  }
}

export function startReconnectingSubscription(
  options: ReconnectingSubscriptionOptions
): ReconnectingSubscription {
  const sub = new ReconnectingSubscriptionImpl(options);
  sub.start();
  return {
    stop: (): void => sub.stop(),
    currentAttempt: (): number => sub.currentAttempt(),
  };
}
