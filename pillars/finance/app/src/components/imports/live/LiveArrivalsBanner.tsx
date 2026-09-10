import { useQuery } from '@tanstack/react-query';
import { Radio } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@pops/ui';

import { unwrap } from '../../../finance-api-helpers.js';
import { importDraftsList } from '../../../finance-api/index.js';
import { useImportStore } from '../../../store/importStore';

/**
 * Rows the bank sent after this import was opened do not appear in it
 * (finance ADR-005): they wait in the account's next live draft, and this
 * banner is the only sign of them here. Read once when Review opens and
 * held for the visit: a count that moves under the person is the thing the
 * rule exists to prevent.
 */
export function LiveArrivalsBanner() {
  const draftId = useImportStore((s) => s.draftId);
  const accountId = useImportStore((s) => s.accountId);
  const source = useImportStore((s) => s.draftSource);
  const live = source?.kind === 'live' && draftId !== null && accountId !== null;
  const query = useQuery({
    queryKey: ['finance', 'import-drafts', 'held-back', draftId],
    queryFn: async () =>
      unwrap(await importDraftsList({ query: { account: accountId ?? '', state: 'live' } }))
        .data.filter((draft) => draft.id !== draftId)
        .reduce((sum, draft) => sum + draft.rowCount, 0),
    enabled: live,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
  const count = query.data ?? 0;
  if (!live || count === 0) return null;
  return (
    <Alert>
      <Radio aria-hidden />
      <AlertTitle>
        {count === 1 ? '1 more transaction has' : `${count} more transactions have`} arrived from Up
      </AlertTitle>
      <AlertDescription>
        <p>
          They are waiting in the next pending import, so nothing here has moved. Finish this one
          and it will be on the dashboard.
        </p>
      </AlertDescription>
    </Alert>
  );
}
