export const TYPE_OPTIONS = [
  { value: '', label: '— none —' },
  { value: 'purchase', label: 'Expense' },
  { value: 'transfer', label: 'Transfer' },
  { value: 'income', label: 'Income' },
];

export const MATCH_TYPE_OPTIONS = [
  { value: 'exact', label: 'Exact' },
  { value: 'contains', label: 'Contains' },
  { value: 'regex', label: 'Regex' },
];

export type TxnType = 'purchase' | 'transfer' | 'income';

export function parseTxnType(raw: string): TxnType | undefined {
  if (raw === '') return undefined;
  return raw as TxnType;
}
