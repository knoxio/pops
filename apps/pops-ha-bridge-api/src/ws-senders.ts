/**
 * Outbound-sender composition for the HA WebSocket subscriber.
 *
 * Bundles the `fire_event` sink sender (PRD-237 US-02) and the
 * `call_service` AI-tool sender (PRD-229 US-04) so the subscriber's
 * constructor stays inside its per-file complexity budget. Both senders
 * share the same live-socket gate, `nextCommandId` counter and logger —
 * the bundle composes them around those shared deps.
 */
import { CallServiceSender } from './ai-tools/call-service-sender.js';
import {
  createFireEventSenderForSubscriber,
  type FireEventSender,
} from './sinks/fire-event-sender.js';

import type { SubscriberLogger } from './ws-subscriber-types.js';

export interface SenderBundleDeps {
  readonly isLive: () => boolean;
  readonly sendOnSocket: (data: string) => void;
  readonly nextCommandId: () => number;
  readonly logger: SubscriberLogger;
  readonly now: () => number;
  readonly setTimeoutImpl: typeof setTimeout;
  readonly clearTimeoutImpl: typeof clearTimeout;
  readonly sinkQueueCap: number | undefined;
  readonly callServiceTimeoutMs: number | undefined;
}

export interface SenderBundle {
  readonly fireEventSender: FireEventSender;
  readonly callServiceSender: CallServiceSender;
}

export function createSenderBundle(deps: SenderBundleDeps): SenderBundle {
  const liveSocket = { isReady: deps.isLive, send: deps.sendOnSocket };
  return {
    fireEventSender: createFireEventSenderForSubscriber({
      liveSocket,
      nextCommandId: deps.nextCommandId,
      logger: deps.logger,
      now: deps.now,
      queueCap: deps.sinkQueueCap,
    }),
    callServiceSender: new CallServiceSender({
      liveSocket,
      nextCommandId: deps.nextCommandId,
      logger: deps.logger,
      setTimeoutImpl: deps.setTimeoutImpl,
      clearTimeoutImpl: deps.clearTimeoutImpl,
      timeoutMs: deps.callServiceTimeoutMs,
    }),
  };
}
