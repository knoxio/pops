/**
 * Generic per-URI reconciliation loop shared by the inventory cron's
 * purchase-transaction + owner walkers (PRD-251). Lives in a sibling file
 * so the outer cron stays under the file-size lint budget.
 */
import type { InventoryDb } from '@pops/inventory-db';

export interface ReconcileLogger {
  info?: (msg: string, meta?: Record<string, unknown>) => void;
  warn?: (msg: string, meta?: Record<string, unknown>) => void;
}

interface ParsedUri {
  pillar: string;
  type: string;
  id: string;
}

interface MutableCounters {
  ok: number;
  notFound: number;
  unavailable: number;
  badUri: number;
}

type ReconcileOutcome = 'ok' | 'not-found' | 'unavailable' | 'bad-request';

export interface ReconcileBatch {
  db: InventoryDb;
  logger: ReconcileLogger | undefined;
  counters: MutableCounters;
  uris: readonly string[];
  expectedPillar: string;
  expectedType: string;
  parse: (uri: string) => ParsedUri | null;
  probe: (parsed: ParsedUri) => Promise<ReconcileOutcome>;
  onOk: (uri: string) => void;
  onNotFound: (uri: string) => void;
}

function isShapeMatch(
  parsed: ParsedUri | null,
  expectedPillar: string,
  expectedType: string
): boolean {
  return parsed !== null && parsed.pillar === expectedPillar && parsed.type === expectedType;
}

function applyOutcomeToBatch(batch: ReconcileBatch, uri: string, outcome: ReconcileOutcome): void {
  switch (outcome) {
    case 'ok':
      batch.onOk(uri);
      batch.counters.ok += 1;
      return;
    case 'not-found':
      batch.onNotFound(uri);
      batch.counters.notFound += 1;
      batch.logger?.info?.('inventory cross-pillar reconciliation: uri 404', { uri });
      return;
    case 'unavailable':
      batch.counters.unavailable += 1;
      batch.logger?.warn?.('inventory cross-pillar reconciliation: owning pillar unavailable', {
        uri,
      });
      return;
    case 'bad-request':
      batch.counters.badUri += 1;
      batch.logger?.warn?.(
        'inventory cross-pillar reconciliation: bad uri (parsed, pillar rejected)',
        { uri }
      );
      return;
  }
}

export async function reconcileUriBatch(batch: ReconcileBatch): Promise<void> {
  for (const uri of batch.uris) {
    const parsed = batch.parse(uri);
    if (!isShapeMatch(parsed, batch.expectedPillar, batch.expectedType)) {
      batch.counters.badUri += 1;
      batch.logger?.warn?.(
        'inventory cross-pillar reconciliation: bad uri (unparseable / wrong shape)',
        { uri }
      );
      continue;
    }
    const outcome = await batch.probe(parsed as ParsedUri);
    applyOutcomeToBatch(batch, uri, outcome);
  }
}
