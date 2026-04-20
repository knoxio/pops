import crypto from 'crypto-js';

import { extractLocation, parseAmount, parseDate, type ColumnMap } from './parsers';

import type { ParsedTransaction } from '@pops/api/modules/finance/imports';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  parsedTransactions: ParsedTransaction[];
}

interface RowValidation {
  parsed?: ParsedTransaction;
  error?: string;
}

function validateRow(
  row: Record<string, string>,
  columnMap: ColumnMap,
  rowNum: number
): RowValidation {
  const dateStr = row[columnMap.date];
  const parsedDate = parseDate(dateStr);
  if (!parsedDate) return { error: `Row ${rowNum}: Invalid date format "${dateStr}"` };
  const amountStr = row[columnMap.amount];
  const parsedAmount = parseAmount(amountStr);
  if (parsedAmount === null) return { error: `Row ${rowNum}: Invalid amount "${amountStr}"` };
  const description = row[columnMap.description] ?? '';
  const location = columnMap.location ? row[columnMap.location] : undefined;
  const rawRow = JSON.stringify(row);
  return {
    parsed: {
      date: parsedDate,
      description,
      amount: parsedAmount,
      account: 'Amex',
      location: location ? extractLocation(location) : undefined,
      rawRow,
      checksum: crypto.SHA256(rawRow).toString(),
    },
  };
}

export function validateAllRows(
  rows: Record<string, string>[],
  columnMap: ColumnMap
): ValidationResult {
  const errors: string[] = [];
  const parsedTransactions: ParsedTransaction[] = [];
  if (!columnMap.date || !columnMap.description || !columnMap.amount) {
    return {
      valid: false,
      errors: ['Please map all required fields: Date, Description, Amount'],
      parsedTransactions,
    };
  }
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const result = validateRow(row, columnMap, i + 2);
    if (result.error) errors.push(result.error);
    else if (result.parsed) parsedTransactions.push(result.parsed);
  }
  return { valid: errors.length === 0, errors: errors.slice(0, 10), parsedTransactions };
}
