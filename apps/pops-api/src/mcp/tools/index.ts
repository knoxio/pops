/**
 * Tool registry — central catalogue of all MCP tools and their dispatch logic.
 */
import { engramReadSchema, handleEngramRead } from './cerebrum-engram-read.js';
import { engramWriteSchema, handleEngramWrite } from './cerebrum-engram-write.js';
import { cerebrumIngestSchema, handleCerebrumIngest } from './cerebrum-ingest.js';
import { cerebrumQuerySchema, handleCerebrumQuery } from './cerebrum-query.js';
import { cerebrumSearchSchema, handleCerebrumSearch } from './cerebrum-search.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { ToolHandler } from '../types.js';

/** MCP tool definition as returned by ListTools. */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** All registered tools. */
export const toolDefinitions: ToolDefinition[] = [
  {
    name: 'cerebrum.search',
    description:
      'Search the Cerebrum knowledge base using hybrid semantic + structured search. Returns ranked results with titles, scores, scopes, and content snippets.',
    inputSchema: cerebrumSearchSchema,
  },
  {
    name: 'cerebrum.ingest',
    description:
      'Ingest new content into the Cerebrum knowledge base. Accepts plain text, Markdown, or JSON. Runs classification, entity extraction, and scope inference automatically.',
    inputSchema: cerebrumIngestSchema,
  },
  {
    name: 'cerebrum.engram.read',
    description:
      'Read an engram by ID. Returns full metadata (title, type, scopes, tags, status, timestamps) and the body content.',
    inputSchema: engramReadSchema,
  },
  {
    name: 'cerebrum.engram.write',
    description:
      'Update an existing engram. Can modify body, title, scopes, and/or tags. Returns updated metadata.',
    inputSchema: engramWriteSchema,
  },
  {
    name: 'cerebrum.query',
    description:
      'Ask a natural language question about the knowledge base. Returns a grounded answer with source citations. Limits retrieval to top-3 results for low latency.',
    inputSchema: cerebrumQuerySchema,
  },
];

/** Map of tool name → handler function. */
const handlers: Record<string, ToolHandler> = {
  'cerebrum.search': handleCerebrumSearch,
  'cerebrum.ingest': handleCerebrumIngest,
  'cerebrum.engram.read': handleEngramRead,
  'cerebrum.engram.write': handleEngramWrite,
  'cerebrum.query': handleCerebrumQuery,
};

/** Dispatch a tool call by name. Returns null if the tool is not registered. */
export function dispatchTool(
  name: string,
  args: Record<string, unknown>
): Promise<CallToolResult> | null {
  const handler = handlers[name];
  if (!handler) return null;
  return handler(args);
}
