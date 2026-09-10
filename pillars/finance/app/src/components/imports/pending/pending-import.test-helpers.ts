/** A pending import as the list route serves it, for the card and dialog suites. Not for production use. */
import type { PendingImport } from './pending-import-view';

export function makeDraft(overrides: Partial<PendingImport> = {}): PendingImport {
  return {
    id: 'd1',
    accountId: 'acc-1',
    source: { kind: 'file', dialectId: 'Amex', fileNames: ['activity_2026-08.csv'] },
    state: 'saved',
    step: 4,
    rowCount: 46,
    unresolvedCount: 3,
    span: { from: '2026-08-01', to: '2026-08-31' },
    balanceReportedCents: null,
    processSessionId: null,
    savedAt: '2026-09-04T11:12:00.000Z',
    createdAt: '2026-09-04T11:00:00.000Z',
    ownerSeenAt: null,
    unusableCause: null,
    unusableReason: null,
    ...overrides,
  };
}
