/**
 * HA bridge AI tool registry (PRD-229 US-03).
 *
 * Each descriptor projects an internal Zod input schema to the
 * JSON-Schema-shaped `parameters` field expected by the pillar manifest's
 * `ai.tools` slot. The same descriptor list is the source of truth for
 * the future tool-router binding — adding a tool is one entry, no core
 * edit.
 *
 * US-03 ships `entityList` only. `entityGetState` lands in a follow-up.
 */
import { z } from 'zod';

import { ENTITY_LIST_TOOL_NAME, entityListInputSchema } from './entity-list.js';

import type { ManifestPayload } from '@pops/pillar-sdk/manifest-schema';

type AiToolDescriptor = ManifestPayload['ai']['tools'][number];

interface AiToolSource {
  name: string;
  description: string;
  inputSchema: z.ZodType;
}

const sources: AiToolSource[] = [
  {
    name: ENTITY_LIST_TOOL_NAME,
    description:
      'List Home Assistant entities the bridge currently mirrors. Optionally filter by `domain` (e.g. "light", "sensor") and/or `area` (e.g. "kitchen"). Results are paginated by `entity_id` — pass `nextCursor` back as `cursor` to fetch the next page. Read-only.',
    inputSchema: entityListInputSchema,
  },
];

function toParameters(schema: z.ZodType): Record<string, unknown> {
  const projected = z.toJSONSchema(schema, { target: 'draft-7', unrepresentable: 'any' });
  if (typeof projected !== 'object' || projected === null) {
    throw new Error('z.toJSONSchema returned a non-object schema');
  }
  return projected as Record<string, unknown>;
}

export const haBridgeAiTools: AiToolDescriptor[] = sources.map((source) => ({
  name: source.name,
  description: source.description,
  parameters: toParameters(source.inputSchema),
}));

export { ENTITY_LIST_TOOL_NAME } from './entity-list.js';
export {
  decodeEntityCursor,
  encodeEntityCursor,
  ENTITY_LIST_DEFAULT_LIMIT,
  ENTITY_LIST_MAX_LIMIT,
  entityListInputSchema,
  runEntityList,
  type EntityListInput,
  type EntityListOutput,
} from './entity-list.js';
