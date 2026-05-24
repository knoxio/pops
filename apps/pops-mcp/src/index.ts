import { readFileSync } from 'node:fs';

import { config } from 'dotenv';

config();
config({ path: '../../.env', override: false });

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
import express from 'express';

import { allTools } from './tools/index.js';

function createMcpServer(): Server {
  const server = new Server({ name: 'pops', version: '1.0.0' }, { capabilities: { tools: {} } });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    const tool = allTools.find((t) => t.name === name);
    if (!tool) {
      return {
        content: [{ type: 'text' as const, text: `Unknown tool: ${name}` }],
        isError: true,
      };
    }
    try {
      return await tool.handler((args ?? {}) as Record<string, unknown>);
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

const app = express();
app.use(express.json());

app.post('/mcp', async (req, res) => {
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  const server = createMcpServer();

  res.on('close', async () => {
    await server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', tools: allTools.length });
});

const port = Number(process.env['MCP_PORT'] ?? 3002);
app.listen(port, '0.0.0.0', () => {
  console.warn(`[pops-mcp] HTTP MCP server on port ${port} (${allTools.length} tools)`);
});
