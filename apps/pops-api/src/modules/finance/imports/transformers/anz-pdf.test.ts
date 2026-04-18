import crypto from 'crypto';

import { describe, expect, it } from 'vitest';

import { parseAnzPdfText } from './anz-pdf.js';

// Sample text lines mirroring what pdf-parse extracts from ANZ PDF statements.
// Columns: date-processed  date-of-tx  card-last4  description  amount [CR]  balance

describe('parseAnzPdfText', () => {
  it('parses a purchase (debit) row', () => {
    const text = '04/04/2025  03/04/2025  4567  WOOLWORTHS METRO SYDNEY NSW  52.30  3,429.45';
    const [tx] = parseAnzPdfText(text);
    expect(tx?.date).toBe('2025-04-03');
    expect(tx?.description).toBe('WOOLWORTHS METRO SYDNEY NSW');
    expect(tx?.amount).toBe(-52.3);
    expect(tx?.account).toBe('ANZ Frequent Flyer Black');
  });

  it('parses a credit (CR suffix) row as a positive amount', () => {
    const text = '05/04/2025  04/04/2025  4567  PAYMENT - THANK YOU  500.00 CR  2,929.45';
    const [tx] = parseAnzPdfText(text);
    expect(tx?.amount).toBe(500);
  });

  it('skips supplementary rows (no card last-4)', () => {
    const text = [
      '04/04/2025  03/04/2025  4567  AMAZON.COM.AU  29.99  3,000.00',
      '3.99 USD',
      'INCL OVERSEAS TXN FEE 1.20 AUD',
    ].join('\n');
    const txs = parseAnzPdfText(text);
    expect(txs).toHaveLength(1);
    expect(txs[0]?.description).toBe('AMAZON.COM.AU');
  });

  it('skips the header row', () => {
    const text =
      'Date Processed  Date of Transaction  Card Used  Transaction Details  Amount ($A)  Balance';
    expect(parseAnzPdfText(text)).toHaveLength(0);
  });

  it('skips blank lines and unrelated text', () => {
    const text = [
      '',
      'ANZ Bank Credit Card Statement',
      'Account Number: xxxx xxxx xxxx 4567',
      '04/04/2025  03/04/2025  4567  WOOLWORTHS  52.30  3,429.45',
      '',
      'Closing Balance: 3,429.45',
    ].join('\n');
    expect(parseAnzPdfText(text)).toHaveLength(1);
  });

  it('handles amounts with comma thousands separators', () => {
    const text = '01/04/2025  01/04/2025  4567  INTERNATIONAL WIRE  1,234.56  10,000.00';
    const [tx] = parseAnzPdfText(text);
    expect(tx?.amount).toBe(-1234.56);
  });

  it('collapses multiple whitespace characters in descriptions', () => {
    const text = '04/04/2025  03/04/2025  4567  COLES   CHATSWOOD    NSW  45.00  500.00';
    const [tx] = parseAnzPdfText(text);
    expect(tx?.description).toBe('COLES CHATSWOOD NSW');
  });

  it('processes multiple transaction rows in order', () => {
    const text = [
      '03/04/2025  02/04/2025  4567  WOOLWORTHS METRO  52.30  5,000.00',
      '04/04/2025  03/04/2025  4567  UBER* TRIP  25.50  4,947.70',
      '05/04/2025  04/04/2025  4567  PAYMENT  500.00 CR  5,447.70',
    ].join('\n');
    const txs = parseAnzPdfText(text);
    expect(txs).toHaveLength(3);
    expect(txs[0]?.amount).toBe(-52.3);
    expect(txs[1]?.amount).toBe(-25.5);
    expect(txs[2]?.amount).toBe(500);
  });

  it('uses the date-of-transaction column (not date-processed)', () => {
    // Date processed = 10/04/2025, date of transaction = 08/04/2025
    const text = '10/04/2025  08/04/2025  4567  NETFLIX  19.99  1,000.00';
    const [tx] = parseAnzPdfText(text);
    expect(tx?.date).toBe('2025-04-08');
  });

  it('generates stable deterministic checksums for the same row', () => {
    const text = '04/04/2025  03/04/2025  4567  WOOLWORTHS  52.30  3,429.45';
    const [tx1] = parseAnzPdfText(text);
    const [tx2] = parseAnzPdfText(text);
    expect(tx1?.checksum).toBe(tx2?.checksum);
  });

  it('generates different checksums for different transactions', () => {
    const text = [
      '04/04/2025  03/04/2025  4567  WOOLWORTHS  52.30  3,429.45',
      '05/04/2025  04/04/2025  4567  COLES  45.00  3,384.45',
    ].join('\n');
    const [t1, t2] = parseAnzPdfText(text);
    expect(t1?.checksum).not.toBe(t2?.checksum);
  });

  it('stores rawRow as key-sorted JSON for audit trail', () => {
    const text = '04/04/2025  03/04/2025  4567  WOOLWORTHS  52.30  3,429.45';
    const [tx] = parseAnzPdfText(text);
    const parsed = JSON.parse(tx?.rawRow ?? '') as Record<string, string>;
    const keys = Object.keys(parsed);
    expect(keys).toEqual([...keys].toSorted());
    expect(parsed['account']).toBe('ANZ Frequent Flyer Black');
    expect(parsed['date']).toBe('2025-04-03');
    expect(parsed['description']).toBe('WOOLWORTHS');
  });

  it('checksum matches SHA-256 of rawRow', () => {
    const text = '04/04/2025  03/04/2025  4567  WOOLWORTHS  52.30  3,429.45';
    const [tx] = parseAnzPdfText(text);
    const expected = crypto
      .createHash('sha256')
      .update(tx?.rawRow ?? '')
      .digest('hex');
    expect(tx?.checksum).toBe(expected);
  });

  it('handles a card with a different last-4 on the same statement', () => {
    // Supplementary cards have different last-4 — still treated as real transactions
    const text = [
      '04/04/2025  03/04/2025  4567  WOOLWORTHS  52.30  5,000.00',
      '04/04/2025  03/04/2025  8901  COLES  45.00  4,947.70',
    ].join('\n');
    const txs = parseAnzPdfText(text);
    expect(txs).toHaveLength(2);
  });
});
