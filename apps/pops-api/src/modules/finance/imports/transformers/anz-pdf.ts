import { createHash } from 'crypto';

import { normaliseDate } from '../lib/parse-utils.js';

import type { ParsedTransaction } from '../types.js';

const ACCOUNT = 'ANZ Frequent Flyer Black';

// Matches a full ANZ credit-card PDF transaction row:
//   date-processed  date-of-tx  card-last4  description  amount [CR]  balance
//
// Supplementary rows (foreign-currency equivalents, overseas fee lines) lack a
// 4-digit card number and do not match — they are skipped automatically.
const ROW_RE =
  /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+\d{4}\s+(.+?)\s+([\d,]+\.\d{2})(\s+CR)?\s+[\d,]+\.\d{2}\s*$/;

/**
 * Parse transaction rows from extracted ANZ credit-card PDF text.
 *
 * Accepts the raw text string returned by a PDF extractor and returns one
 * ParsedTransaction per transaction row. Supplementary rows (foreign-currency
 * lines, fee labels) are silently skipped.
 *
 * Sign convention:
 *   - Purchases/debits → negative amount
 *   - Credits (amount followed by `CR`) → positive amount
 */
export function parseAnzPdfText(text: string): ParsedTransaction[] {
  const transactions: ParsedTransaction[] = [];

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    const match = ROW_RE.exec(line);
    if (!match) continue;

    const [, , rawTxDate, rawDescription, rawAmount, crSuffix] = match;

    const date = normaliseDate(rawTxDate ?? '');
    const description = (rawDescription ?? '').replace(/\s+/g, ' ').trim();
    const absAmount = parseFloat((rawAmount ?? '').replace(/,/g, ''));
    const amount = crSuffix ? absAmount : -absAmount;

    const rowData = {
      account: ACCOUNT,
      amount: String(amount),
      date,
      description,
    };
    const sortedRow = Object.fromEntries(
      Object.keys(rowData)
        .toSorted()
        .map((k) => [k, rowData[k as keyof typeof rowData]])
    );
    const rawRow = JSON.stringify(sortedRow);
    const checksum = createHash('sha256').update(rawRow).digest('hex');

    transactions.push({ date, description, amount, account: ACCOUNT, rawRow, checksum });
  }

  return transactions;
}

/**
 * Parse an ANZ Frequent Flyer Black PDF statement buffer into ParsedTransactions.
 *
 * Uses pdf-parse for text extraction, then delegates to parseAnzPdfText.
 */
export async function transformAnzPdf(pdfBuffer: Buffer): Promise<ParsedTransaction[]> {
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: pdfBuffer });
  const result = await parser.getText();
  return parseAnzPdfText(result.text);
}
