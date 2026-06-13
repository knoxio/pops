/**
 * `ha.entity.callService` — outbound AI tool (PRD-229 US-04).
 *
 * Allows the LLM to invoke a Home Assistant service (`light.turn_off`,
 * `switch.toggle`, `scene.turn_on`, ...) via the existing HA WebSocket
 * connection. The bridge frames the call as a `call_service` command,
 * awaits HA's `{ type: 'result', id, success }` acknowledgement, and
 * returns a discriminated outcome.
 *
 * Domain/service identifiers are validated as lowercase snake_case to
 * match HA's own naming. Invalid input is rejected at the Zod boundary
 * before any frame is sent. When the bridge is in degraded mode (no
 * live socket) the tool returns `{ kind: 'rejected', reason: 'ha-offline' }`
 * immediately — call_service requests are NOT queued for later delivery
 * because the LLM has already factored the response into its turn.
 */
import { z } from 'zod';

export const CALL_SERVICE_TOOL_NAME = 'entityCallService' as const;

const HA_IDENTIFIER = /^[a-z][a-z0-9_]*$/;

export const callServiceInputSchema = z
  .object({
    domain: z.string().min(1).max(64).regex(HA_IDENTIFIER, 'domain must be lowercase snake_case'),
    service: z.string().min(1).max(64).regex(HA_IDENTIFIER, 'service must be lowercase snake_case'),
    entityId: z
      .string()
      .min(3)
      .max(255)
      .regex(/^[a-z][a-z0-9_]*\.[a-z0-9_]+$/, 'entityId must be <domain>.<object_id>')
      .optional(),
    serviceData: z.record(z.string(), z.unknown()).optional(),
  })
  .strict();

export type CallServiceInput = z.infer<typeof callServiceInputSchema>;

export type CallServiceRejectionReason =
  | 'pillar-unavailable'
  | 'ha-offline'
  | 'service-not-found'
  | 'invalid-input';

export type CallServiceOutcome =
  | { kind: 'ok' }
  | { kind: 'rejected'; reason: CallServiceRejectionReason; message?: string };

export const CALL_SERVICE_TOOL_DESCRIPTION =
  'Invoke a Home Assistant service to control an entity. Examples: ' +
  '`light.turn_off` on `light.kitchen`, `switch.toggle` on `switch.heater`, ' +
  '`scene.turn_on` on `scene.movie_night`. `serviceData` is forwarded to HA ' +
  'verbatim for service-specific options (e.g. `{ brightness_pct: 60 }`). ' +
  'Returns `{ kind: "ok" }` on success, or `{ kind: "rejected", reason }` ' +
  'on failure where reason is one of: `ha-offline`, `service-not-found`, ' +
  '`invalid-input`, `pillar-unavailable`.';
