import { connectionTools } from './inventory-connections.js';
import { itemTools } from './inventory-items.js';
import { locationTools } from './inventory-locations.js';

import type { ToolDef } from './index.js';

export const inventoryTools: readonly ToolDef[] = [
  ...locationTools,
  ...itemTools,
  ...connectionTools,
];
