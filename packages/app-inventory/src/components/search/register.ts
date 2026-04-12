/**
 * Side-effect module that registers inventory search ResultComponents.
 * Import this module to register the inventory-items ResultComponent.
 */
import { registerResultComponent } from '@pops/navigation';

import { InventoryItemSearchResult } from './InventoryItemSearchResult';

registerResultComponent('inventory-items', InventoryItemSearchResult);
