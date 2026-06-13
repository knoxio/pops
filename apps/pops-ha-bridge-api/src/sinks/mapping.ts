/**
 * PRD-237 US-01 / PRD-229 US-05: HA sink mapping config.
 *
 * Each entry maps a POPS `eventType` (`<source>.<entity>.<action>`) to:
 *   - the HA event name forwarded over the WebSocket `fire_event` frame,
 *   - the JSON-Schema-shaped payload contract advertised in the
 *     pillar manifest's `sinks.descriptors` block,
 *   - a pure `transformInline` that maps the POPS payload to the HA
 *     `event_data` object (PRD-237 fire_event mappings) or a
 *     `buildFrameBody` that produces an arbitrary HA WS command body
 *     (PRD-229 US-05 ha-native sinks like `ha.notify.send`).
 *
 * The same array is the source of truth for both manifest derivation
 * (`apps/pops-ha-bridge-api/src/manifest.ts`) and the runtime handler
 * registry (US-02). Adding a mapping = adding an entry; no core edit.
 */

export type SinkMappingTransform = (payload: Record<string, unknown>) => Record<string, unknown>;

export type SinkMappingFrameBuilder = (payload: Record<string, unknown>) => Record<string, unknown>;

export interface SinkMapping {
  eventType: string;
  description: string;
  haEventName: string;
  schema: Record<string, unknown>;
  transformInline: SinkMappingTransform;
  buildFrameBody?: SinkMappingFrameBuilder;
}

const identityTransform: SinkMappingTransform = (payload) => payload;

const HA_NOTIFY_DEFAULT_SERVICE = 'notify';

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asStringOrArray(value: unknown): string | string[] | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.every((entry): entry is string => typeof entry === 'string')) {
    return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function buildHaNotifyFrameBody(payload: Record<string, unknown>): Record<string, unknown> {
  const service = asString(payload['service']) ?? HA_NOTIFY_DEFAULT_SERVICE;
  const serviceData: Record<string, unknown> = { message: payload['message'] };
  const title = asString(payload['title']);
  if (title !== undefined) serviceData['title'] = title;
  const data = asRecord(payload['data']);
  if (data !== undefined) {
    for (const [key, value] of Object.entries(data)) {
      serviceData[key] = value;
    }
  }
  const body: Record<string, unknown> = {
    type: 'call_service',
    domain: 'notify',
    service,
    service_data: serviceData,
  };
  const target = asStringOrArray(payload['target']);
  if (target !== undefined) {
    body['target'] = { entity_id: target };
  }
  return body;
}

function buildHaEventFireFrameBody(payload: Record<string, unknown>): Record<string, unknown> {
  const eventType = asString(payload['eventType']) ?? '';
  const eventData = asRecord(payload['eventData']) ?? {};
  return {
    type: 'fire_event',
    event_type: eventType,
    event_data: eventData,
  };
}

export const mappings: SinkMapping[] = [
  {
    eventType: 'media.watch.completed',
    description:
      'Fires when a user finishes watching a media item. HA automations may use this to dim the lights or stop ambient audio.',
    haEventName: 'pops_media_watch_completed',
    schema: {
      type: 'object',
      required: ['mediaId', 'userId', 'occurredAt'],
      properties: {
        mediaId: { type: 'string' },
        userId: { type: 'string' },
        occurredAt: { type: 'string', format: 'date-time' },
        durationSeconds: { type: 'number' },
      },
      additionalProperties: false,
    },
    transformInline: identityTransform,
  },
  {
    eventType: 'finance.balance.low',
    description:
      'Fires when an account balance crosses below the configured threshold. HA automations may push a notification or trigger an alert light.',
    haEventName: 'pops_finance_balance_low',
    schema: {
      type: 'object',
      required: ['accountId', 'balance', 'threshold', 'occurredAt'],
      properties: {
        accountId: { type: 'string' },
        balance: { type: 'number' },
        threshold: { type: 'number' },
        currency: { type: 'string' },
        occurredAt: { type: 'string', format: 'date-time' },
      },
      additionalProperties: false,
    },
    transformInline: identityTransform,
  },
  {
    eventType: 'inventory.item.consumed',
    description:
      'Fires when a tracked inventory item is consumed. HA automations may add the item to a shopping list or notify a resident.',
    haEventName: 'pops_inventory_item_consumed',
    schema: {
      type: 'object',
      required: ['itemId', 'quantity', 'occurredAt'],
      properties: {
        itemId: { type: 'string' },
        quantity: { type: 'number' },
        unit: { type: 'string' },
        occurredAt: { type: 'string', format: 'date-time' },
      },
      additionalProperties: false,
    },
    transformInline: identityTransform,
  },
  {
    eventType: 'ha.notify.send',
    description:
      'HA-native sink — any pillar may publish to push a notification through Home Assistant. The bridge translates to a `call_service` frame on `notify.<service>` (default `notify`). Use `target` to route to a specific device/group entity.',
    haEventName: 'ha_notify_send',
    schema: {
      type: 'object',
      required: ['message'],
      properties: {
        service: { type: 'string' },
        message: { type: 'string' },
        title: { type: 'string' },
        target: {
          oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
        },
        data: { type: 'object', additionalProperties: true },
      },
      additionalProperties: false,
    },
    transformInline: identityTransform,
    buildFrameBody: buildHaNotifyFrameBody,
  },
  {
    eventType: 'ha.event.fire',
    description:
      'HA-native sink — any pillar may publish an arbitrary HA `fire_event` with arbitrary event_data. The bridge forwards the supplied `eventType` and `eventData` verbatim. Use sparingly: prefer namespaced POPS-side mappings when possible.',
    haEventName: 'ha_event_fire',
    schema: {
      type: 'object',
      required: ['eventType'],
      properties: {
        eventType: { type: 'string' },
        eventData: { type: 'object', additionalProperties: true },
      },
      additionalProperties: false,
    },
    transformInline: identityTransform,
    buildFrameBody: buildHaEventFireFrameBody,
  },
];
