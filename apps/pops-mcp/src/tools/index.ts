import { cerebrumTools } from './cerebrum.js';
import { financeTools } from './finance.js';
import { inventoryTools } from './inventory.js';
import { mediaTools } from './media.js';

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<CallToolResult>;
}

export const allTools: readonly ToolDef[] = [
  ...inventoryTools,
  ...financeTools,
  ...mediaTools,
  ...cerebrumTools,
];
