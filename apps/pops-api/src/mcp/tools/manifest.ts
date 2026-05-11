/**
 * Cerebrum AI tool manifest — the `AiToolDescriptor[]` slot for the
 * cerebrum module's backend manifest (PRD-101 US-10).
 *
 * Each entry mirrors the previous hand-rolled `toolDefinitions` list while
 * binding the descriptor directly to its handler. Aggregation happens at
 * the platform consumer: `apps/pops-api/src/mcp/tools/index.ts` reads
 * `installedManifests().flatMap(m => m.backend?.aiTools ?? [])` and builds
 * the registry the MCP server consumes.
 *
 * The handlers below are typed against `CallToolResult` (the MCP SDK shape).
 * `toAiToolHandler` is a thin adapter that narrows the result to
 * `AiToolResult` (PRD-101's platform-neutral shape) by filtering out any
 * non-text content blocks. In practice every handler in this file already
 * returns text-only content via `mcpSuccess` / `mcpError`, so the adapter
 * is a pure type-narrowing pass.
 */
import { engramReadSchema, handleEngramRead } from './cerebrum-engram-read.js';
import { engramWriteSchema, handleEngramWrite } from './cerebrum-engram-write.js';
import { cerebrumIngestSchema, handleCerebrumIngest } from './cerebrum-ingest.js';
import { cerebrumQuerySchema, handleCerebrumQuery } from './cerebrum-query.js';
import { cerebrumSearchSchema, handleCerebrumSearch } from './cerebrum-search.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { AiToolDescriptor, AiToolHandler, AiToolResult } from '@pops/types';

import type { ToolHandler } from '../types.js';

/**
 * Narrow a `CallToolResult` (the MCP SDK shape — content can be text,
 * image, audio, or resource block) down to the platform-neutral
 * `AiToolResult` (text-only). Cerebrum tools only ever emit text content
 * today, so non-text blocks are intentionally dropped if they ever appear.
 */
function toAiToolResult(result: CallToolResult): AiToolResult {
  const textOnly = result.content.filter(
    (block): block is { type: 'text'; text: string } => block.type === 'text'
  );
  return result.isError === undefined
    ? { content: textOnly }
    : { content: textOnly, isError: result.isError };
}

function toAiToolHandler(handler: ToolHandler): AiToolHandler {
  return async (input) => toAiToolResult(await handler(input));
}

/**
 * The `AiToolDescriptor[]` slot for the cerebrum module. Consumed by the
 * platform-level aggregator (`MODULES.flatMap(m => m.backend?.aiTools)`).
 */
export const cerebrumAiTools: readonly AiToolDescriptor[] = [
  {
    name: 'cerebrum.search',
    description:
      'Search the Cerebrum knowledge base using hybrid semantic + structured search. Returns ranked results with titles, scores, scopes, and content snippets.',
    inputSchema: cerebrumSearchSchema,
    handler: toAiToolHandler(handleCerebrumSearch),
  },
  {
    name: 'cerebrum.ingest',
    description:
      'Ingest new content into the Cerebrum knowledge base. Accepts plain text, Markdown, or JSON. Runs classification, entity extraction, and scope inference automatically.',
    inputSchema: cerebrumIngestSchema,
    handler: toAiToolHandler(handleCerebrumIngest),
  },
  {
    name: 'cerebrum.engram.read',
    description:
      'Read an engram by ID. Returns full metadata (title, type, scopes, tags, status, timestamps) and the body content.',
    inputSchema: engramReadSchema,
    handler: toAiToolHandler(handleEngramRead),
  },
  {
    name: 'cerebrum.engram.write',
    description:
      'Update an existing engram. Can modify body, title, scopes, and/or tags. Returns updated metadata.',
    inputSchema: engramWriteSchema,
    handler: toAiToolHandler(handleEngramWrite),
  },
  {
    name: 'cerebrum.query',
    description:
      'Ask a natural language question about the knowledge base. Returns a grounded answer with source citations. Limits retrieval to top-3 results for low latency.',
    inputSchema: cerebrumQuerySchema,
    handler: toAiToolHandler(handleCerebrumQuery),
  },
];
