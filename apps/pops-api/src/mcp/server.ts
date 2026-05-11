/**
 * Cerebrum MCP server — standalone entry point for Claude Code stdio transport.
 *
 * Spawn with: `npx tsx apps/pops-api/src/mcp/server.ts`
 *
 * Bootstraps the database connection, registers all tools, and connects
 * via stdio. Each tool call delegates to existing cerebrum services.
 */
import { config } from 'dotenv';

// Load environment variables using the same pattern as the main API entry point.
// CWD is typically the repo root when spawned by Claude Code.
config(); // loads .env in CWD if present
config({ path: 'apps/pops-api/.env', override: false });

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

import { mcpError } from './errors.js';
import { dispatchTool, listTools } from './tools/index.js';

const server = new Server({ name: 'cerebrum', version: '1.0.0' }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: listTools(),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const safeArgs = (args ?? {}) as Record<string, unknown>;

  const result = dispatchTool(name, safeArgs);
  if (!result) {
    return mcpError(`Unknown tool: ${name}`, 'VALIDATION_ERROR');
  }

  return result;
});

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[cerebrum-mcp] Fatal: ${message}\n`);
  process.exit(1);
});
