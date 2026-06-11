/**
 * Thin shim forwarding `findExistingChecksums` to `@pops/finance-db`'s
 * `importsService`.
 *
 * Track N6 phase 1 PR 3 cutover: the implementation now lives in
 * `packages/finance-db/src/services/imports.ts`. The slice's transformer
 * pipeline + orchestration code (process / execute / progress streaming /
 * AI categoriser / commitImport) stays in-tree — only the four pure
 * persistence helpers move. PR 4 will retire the shim once the in-tree
 * imports module no longer references it.
 */
import { importsService } from '@pops/finance-db';

import { getFinanceDrizzle } from '../../../../db/finance-handle.js';

export function findExistingChecksums(checksums: string[]): Set<string> {
  return importsService.findExistingChecksums(getFinanceDrizzle(), checksums);
}
