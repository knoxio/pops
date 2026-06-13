/**
 * PRD-237 US-01: HA sink mapping config.
 *
 * Each entry maps a POPS `eventType` (`<source>.<entity>.<action>`) to:
 *   - the HA event name forwarded over the WebSocket `fire_event` frame,
 *   - the JSON-Schema-shaped payload contract advertised in the
 *     pillar manifest's `sinks.descriptors` block,
 *   - a pure `transformInline` that maps the POPS payload to the HA
 *     `event_data` object.
 *
 * The same array is the source of truth for both manifest derivation
 * (`apps/pops-ha-bridge-api/src/manifest.ts`) and the runtime handler
 * registry (US-02). Adding a mapping = adding an entry; no core edit.
 */

export type SinkMappingTransform = (payload: Record<string, unknown>) => Record<string, unknown>;

export interface SinkMapping {
  eventType: string;
  description: string;
  haEventName: string;
  schema: Record<string, unknown>;
  transformInline: SinkMappingTransform;
}

const identityTransform: SinkMappingTransform = (payload) => payload;

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
];
