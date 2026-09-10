/** Query keys for the account imports page; one place so a mutation can bust exactly what it changed. */
export const accountImportConfigKey = (accountId: string) =>
  ['finance', 'accounts', accountId, 'import-config'] as const;

export const accountImportBatchesKey = (accountId: string) =>
  ['finance', 'accounts', accountId, 'imports'] as const;
