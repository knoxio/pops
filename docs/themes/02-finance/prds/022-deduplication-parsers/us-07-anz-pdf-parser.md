# US-07: ANZ PDF statement parser

> PRD: [022 — Deduplication & Parsers](README.md)
> Status: Done

## Description

As a user, I want to import ANZ PDF credit card statements so that transactions not available via CSV export are in POPS.

## Format

ANZ Frequent Flyer Black (and other ANZ credit card) PDF statements. Transaction table columns:

| Column              | Notes                                                                  |
| ------------------- | ---------------------------------------------------------------------- |
| Date Processed      | DD/MM/YYYY — when ANZ posted it; ignored in favour of transaction date |
| Date of Transaction | DD/MM/YYYY — actual merchant date; use this as `date`                  |
| Card Used           | Last 4 digits; absent on supplementary rows                            |
| Transaction Details | Merchant name + location string                                        |
| Amount ($A)         | Positive float; `CR` suffix denotes credits (payments, refunds)        |
| Balance             | Running balance after row; ignored                                     |

**Supplementary rows** (skip entirely — no card number, no amount):

- Foreign currency equivalent lines (e.g. `3.99 USD`, `182.00 EUR`)
- Overseas transaction fee lines (e.g. `INCL OVERSEAS TXN FEE 1.20 AUD`)

## Acceptance Criteria

- [x] Extracts text from ANZ PDF using a PDF parsing library (e.g. `pdf-parse`)
- [x] Identifies and skips supplementary rows (no card last-4, no amount)
- [x] Date: `Date of Transaction` column, DD/MM/YYYY → YYYY-MM-DD
- [x] Amount: parse float; amounts with `CR` suffix are positive (credits); all other amounts are negative (expenses)
- [x] Description: clean whitespace from Transaction Details field
- [x] Account: `"ANZ Frequent Flyer Black"` (hardcoded; extend when other ANZ PDF variants appear)
- [x] Output: valid `ParsedTransaction[]` with checksums
- [x] Test with sample ANZ PDF statement data

## Notes

Sign convention differs from the ANZ CSV parser: the PDF shows all amounts as positive, using `CR` to mark credits. Purchases must be negated; credits stay positive.

The last-4 card digits in the Card Used column can vary within a single statement (supplementary cards). This field is not used in `ParsedTransaction` — presence/absence is only used to identify supplementary rows.
