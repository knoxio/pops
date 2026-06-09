/**
 * `/food/data/prep-states` route entry. Defers to the tab's content
 * tree under `./prep-states/` (PRD-122-C).
 */
import { PrepStatesTabContent } from './prep-states/index.js';

export function PrepStatesTab() {
  return <PrepStatesTabContent />;
}
