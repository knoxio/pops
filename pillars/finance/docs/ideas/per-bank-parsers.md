# Idea: Per-bank CSV/PDF parsers

> Status: Not built. Today imports use a single generic column-mapping flow (see `prds/deduplication-parsers`). The bank selector in the upload step is cosmetic — it does not drive parsing.

## Problem

The current importer asks the user to map CSV columns (Date / Description / Amount / Location) by hand and applies one fixed transformation: every amount is negated (`-amount`) and the account is hardcoded to `"Amex"`. That is wrong for every bank except a credit card whose charges are positive, and it forces the user to fix the account name downstream. Each Australian bank exports a different CSV shape with a different sign convention, so a single transformer cannot be correct for all of them.

## Proposed parsers

Each parser normalises one bank's export into the existing `ParsedTransaction` shape (`date`, `description`, `amount`, `account`, `location?`, `rawRow`, `checksum`) and is selected by the `bankType` already captured in the upload step. No manual column mapping when a known bank is chosen.

| Source                | Columns                                               | Sign convention                                             | Account                                                     |
| --------------------- | ----------------------------------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------- |
| Amex CSV              | Date, Amount, Description, Town/City                  | charges positive → negate to expenses                       | `"Amex"`                                                    |
| ANZ CSV               | Date, Amount, Description                             | already signed correctly → no inversion                     | `"ANZ Everyday"` / `"ANZ Savings"`                          |
| ING CSV               | Date, Credit, Debit, Description                      | separate columns → combine, negate debits                   | `"ING Savings"`                                             |
| ANZ PDF (credit card) | Date of Transaction, Transaction Details, Amount ($A) | all positive, `CR` suffix = credit; everything else negated | `"ANZ Frequent Flyer Black"` (hardcoded per statement type) |

### ANZ PDF specifics

- Extract text with a PDF library (e.g. `pdf-parse`).
- Use `Date of Transaction` (merchant date), not `Date Processed`.
- Skip supplementary rows: foreign-currency equivalent lines (`3.99 USD`) and overseas-fee lines (`INCL OVERSEAS TXN FEE 1.20 AUD`) — identified by absence of a `Card Used` last-4 and absence of an amount.
- `Card Used` last-4 is only used to detect supplementary rows; it is not stored.

## Acceptance criteria (when built)

- [ ] `bankType` selection routes to the matching parser; no manual column mapping for known banks.
- [ ] Amex amounts negated; ANZ CSV amounts kept as-is; ING credit/debit combined into one signed amount.
- [ ] Account is set from the parser/bank, not hardcoded to `"Amex"`.
- [ ] ANZ PDF parser skips supplementary rows and treats `CR` as the only credit marker.
- [ ] Each parser emits `ParsedTransaction[]` with a SHA-256 checksum, so the existing dedup pipeline is unchanged.
- [ ] Per-bank fixture tests (sample CSV/PDF) assert correct date, sign, account, and location.

## Notes

`parseDate`, `parseAmount`, `extractLocation` already exist (frontend `column-map/parsers.ts`) and can be reused; only the per-bank sign/account/column logic is missing. The location field is expressed as a normal value on the transaction — there is no online/in-person flag (that is a tag, via `transaction_tag_rules`).
