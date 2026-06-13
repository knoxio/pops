/**
 * PRD-229 US-04: outbound `call_service` sender.
 *
 * Manages the per-frame WS write and the pending-id → resolver map for
 * `ha.entity.callService`. Kept separate from the WebSocket subscriber so
 * the subscriber's inbound state machine stays focused and this module
 * can be unit-tested in isolation.
 *
 * Unlike `FireEventSender`, no queue: an LLM tool call cannot be
 * deferred — the model has already committed the call to its turn and
 * needs a synchronous outcome. When the socket is not ready we resolve
 * `ha-offline` immediately.
 *
 * A pending request is dropped + rejected with `ha-offline` if HA does
 * not respond within `timeoutMs` (default 10s per the PRD).
 */
import {
  callServiceInputSchema,
  type CallServiceInput,
  type CallServiceOutcome,
  type CallServiceRejectionReason,
} from './call-service.js';

import type { SubscriberLogger } from '../ws-subscriber-types.js';

export const CALL_SERVICE_DEFAULT_TIMEOUT_MS = 10_000;

export interface CallServiceLiveSocket {
  readonly isReady: () => boolean;
  readonly send: (data: string) => void;
}

export interface CallServiceSenderDeps {
  readonly liveSocket: CallServiceLiveSocket;
  readonly nextCommandId: () => number;
  readonly logger: SubscriberLogger;
  readonly setTimeoutImpl?: typeof setTimeout;
  readonly clearTimeoutImpl?: typeof clearTimeout;
  readonly timeoutMs?: number;
}

interface PendingCall {
  resolve(outcome: CallServiceOutcome): void;
  timer: ReturnType<typeof setTimeout>;
}

export interface CallServiceResultFrame {
  readonly id: number;
  readonly success: boolean;
  readonly error?: { code?: string; message?: string };
}

export class CallServiceSender {
  private readonly liveSocket: CallServiceLiveSocket;
  private readonly nextCommandId: () => number;
  private readonly logger: SubscriberLogger;
  private readonly setTimeoutImpl: typeof setTimeout;
  private readonly clearTimeoutImpl: typeof clearTimeout;
  private readonly timeoutMs: number;
  private readonly pending = new Map<number, PendingCall>();

  constructor(deps: CallServiceSenderDeps) {
    this.liveSocket = deps.liveSocket;
    this.nextCommandId = deps.nextCommandId;
    this.logger = deps.logger;
    this.setTimeoutImpl = deps.setTimeoutImpl ?? setTimeout;
    this.clearTimeoutImpl = deps.clearTimeoutImpl ?? clearTimeout;
    this.timeoutMs = deps.timeoutMs ?? CALL_SERVICE_DEFAULT_TIMEOUT_MS;
  }

  async call(input: unknown): Promise<CallServiceOutcome> {
    const parsed = callServiceInputSchema.safeParse(input);
    if (!parsed.success) {
      return { kind: 'rejected', reason: 'invalid-input', message: parsed.error.message };
    }
    if (!this.liveSocket.isReady()) {
      return { kind: 'rejected', reason: 'ha-offline' };
    }
    const id = this.nextCommandId();
    const frame = this.serialise(id, parsed.data);
    return new Promise<CallServiceOutcome>((resolve) => {
      const timer = this.setTimeoutImpl(() => {
        if (!this.pending.has(id)) return;
        this.pending.delete(id);
        this.logger.warn('ha call_service timed out', { id, timeoutMs: this.timeoutMs });
        resolve({ kind: 'rejected', reason: 'ha-offline', message: 'timeout' });
      }, this.timeoutMs);
      this.pending.set(id, { resolve, timer });
      this.liveSocket.send(frame);
    });
  }

  handleResult(frame: CallServiceResultFrame): boolean {
    const entry = this.pending.get(frame.id);
    if (entry === undefined) return false;
    this.pending.delete(frame.id);
    this.clearTimeoutImpl(entry.timer);
    if (frame.success) {
      entry.resolve({ kind: 'ok' });
      return true;
    }
    entry.resolve({
      kind: 'rejected',
      reason: this.mapErrorCode(frame.error?.code),
      message: frame.error?.message,
    });
    return true;
  }

  cancelAll(reason: CallServiceOutcome): void {
    for (const [, entry] of this.pending) {
      this.clearTimeoutImpl(entry.timer);
      entry.resolve(reason);
    }
    this.pending.clear();
  }

  pendingCount(): number {
    return this.pending.size;
  }

  private mapErrorCode(code: string | undefined): CallServiceRejectionReason {
    if (code === 'service_not_found' || code === 'not_found') return 'service-not-found';
    return 'ha-offline';
  }

  private serialise(id: number, input: CallServiceInput): string {
    const frame: Record<string, unknown> = {
      id,
      type: 'call_service',
      domain: input.domain,
      service: input.service,
    };
    if (input.entityId !== undefined) {
      frame['target'] = { entity_id: input.entityId };
    }
    if (input.serviceData !== undefined) {
      frame['service_data'] = input.serviceData;
    }
    return JSON.stringify(frame);
  }
}
