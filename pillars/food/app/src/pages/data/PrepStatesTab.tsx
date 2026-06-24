/**
 * `/food/data/prep-states` route entry. Defers to the tab's content
 * tree under `./prep-states/`.
 */
import { PrepStatesTabContent } from './prep-states/index.js';

export function PrepStatesTab() {
  return <PrepStatesTabContent />;
}
