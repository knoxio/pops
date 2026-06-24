/**
 * `/food/data/aliases` route entry. Defers to the tab's content tree
 * under `./aliases/`.
 */
import { AliasesTabContent } from './aliases/index.js';

export function AliasesTab() {
  return <AliasesTabContent />;
}
