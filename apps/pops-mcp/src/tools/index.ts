import { cerebrumTools } from './cerebrum.js';
import { financeTools } from './finance.js';
import { fixtureTools } from './inventory-fixtures.js';
import { inventoryTools } from './inventory.js';
import { mediaTools } from './media.js';

import type { CallToolResult, Tool } from '@modelcontextprotocol/sdk/types.js';

// Use the SDK's own `Tool['inputSchema']` shape rather than a stringly-typed
// `Record<string, unknown>` so the compiler enforces `type: 'object'` and a
// well-formed `properties` map at the definition site.
export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Tool['inputSchema'];
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

export const allTools: readonly ToolDef[] = [
  ...inventoryTools,
  ...fixtureTools,
  ...financeTools,
  ...mediaTools,
  ...cerebrumTools,
];
