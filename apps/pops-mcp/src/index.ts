import { readFileSync } from 'node:fs';

import { config } from 'dotenv';

config();

// Docker secret pattern: read POPS_API_KEY from file when _FILE variant is set
const keyFile = process.env['POPS_API_KEY_FILE'];
if (keyFile && !process.env['POPS_API_KEY']) {
  try {
    process.env['POPS_API_KEY'] = readFileSync(keyFile, 'utf-8').trim();
  } catch {
    console.warn(`[pops-mcp] Could not read POPS_API_KEY_FILE at ${keyFile}`);
  }
}

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import express, { type Express } from 'express';

import { allTools } from './tools/index.js';

export function createMcpServer(): Server {
  const server = new Server({ name: 'pops', version: '1.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: rawArgs } = req.params;
    const tool = allTools.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    const args: Record<string, unknown> = rawArgs ?? {};
    try {
      return await tool.handler(args);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        content: [{ type: 'text' as const, text: `Tool error: ${message}` }],
        isError: true,
      };
    }
  });

  return server;
}

export const app: Express = express();
app.use(express.json({ limit: '1mb' }));

// EventEmitter listeners cannot be async — an `await` inside one returns a
// promise the emitter discards. If `server.close()` rejected we'd hit
// process.on('unhandledRejection'). Hook the cleanup once and surface failures
// through .catch. Exported so a unit test can exercise the rejection path.
export function attachServerCleanup(
  res: { on: (event: 'close', cb: () => void) => unknown },
  server: { close: () => Promise<void> }
): void {
  res.on('close', () => {
    server.close().catch((err: unknown) => {
      console.error('[pops-mcp] server.close() failed:', err);
    });
  });
}

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createMcpServer();

  attachServerCleanup(res, server);

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

// Liveness vs readiness:
//   /health  — fast, no upstream calls, used by Docker HEALTHCHECK
//   /ready   — verifies POPS_API_KEY is set (the most common misconfig);
//              returns 503 when degraded so orchestrators can route around.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', tools: allTools.length });
});

app.get('/ready', (_req, res) => {
  const apiKeyConfigured = Boolean(process.env['POPS_API_KEY']);
  res.status(apiKeyConfigured ? 200 : 503).json({
    status: apiKeyConfigured ? 'ready' : 'degraded',
    apiKeyConfigured,
    tools: allTools.length,
  });
});

// Only start listening when run directly (not in tests)
if (process.env['NODE_ENV'] !== 'test') {
  const port = Number(process.env['MCP_PORT'] ?? 3002);
  app.listen(port, '0.0.0.0', () => {
    console.warn(`[pops-mcp] HTTP MCP server on port ${port} (${allTools.length} tools)`);
  });
}
