import type {
  AccountImportsGetConfigResponses,
  AccountImportsListBatchesResponses,
  AccountImportsWriteConfigData,
} from '../../finance-api/index.js';

/** The `account_import_config` row as the wire serves it. */
export type ImportConfigWire = AccountImportsGetConfigResponses[200]['data'];

/** One `import_batches` row as the wire serves it. */
export type ImportBatchWire = AccountImportsListBatchesResponses[200]['data'][number];

/** The whole-config write `PUT /accounts/:id/import-config` accepts. */
export type WriteImportConfigBody = NonNullable<AccountImportsWriteConfigData['body']>;
