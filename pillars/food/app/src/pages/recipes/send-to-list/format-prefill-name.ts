/**
 * Default name for the "Create new list" radio
 * (pillars/food/docs/prds/send-to-list): `"Shopping list — <yyyy-MM-dd>"`.
 * Pulled out so the test suite can inject a stable clock without freezing
 * the whole modal.
 */
import { format } from 'date-fns';

const DATE_FORMAT = 'yyyy-MM-dd';

export function formatPrefillListName(now: Date, base = 'Shopping list'): string {
  return `${base} — ${format(now, DATE_FORMAT)}`;
}
