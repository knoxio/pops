# Deduplication & CSV Parsing

> Status: Partial. Checksum dedup and the generic CSV column-mapping flow are shipped. Per-bank parsers (Amex/ANZ/ING sign + account logic, ANZ PDF) and Up Bank API import are NOT built — see `docs/ideas/per-bank-parsers.md` and `docs/ideas/up-bank-api-import.md`.

Prepare uploaded transactions for the matching engine: parse a CSV into a common shape and drop rows already in the database. Dedup makes re-importing the same file idempotent.

## CSV parsing (frontend)

The importer is bank-agnostic. The browser parses the CSV (Papa Parse, `header: true`), the user maps columns, and each row is normalised to a `ParsedTransaction`. There are no per-bank backend parsers; the bank selector in the upload step is cosmetic.

Flow: upload step parses the file to `{ headers, rows }` → column-map step auto-detects columns and lets the user override → validation builds `ParsedTransaction[]` → the array is POSTed to `/imports/process`.

**Column mapping** (`column-map/parsers.ts`):

- `autoDetectColumns(headers)` matches headers case-insensitively: date ← `date`/`transaction date`/`posting date`; description ← `description`/`merchant`/`payee`; amount ← `amount`/`debit`/`credit`/`value`; location ← `town`/`city`/`location` (optional).
- Required fields: Date, Description, Amount. Location is optional.

**Transformations** (one generic set, applied to every row):

- `parseDate(s)`: `DD/MM/YYYY` → `YYYY-MM-DD`, zero-padding day/month; returns `null` on anything that is not three slash-separated parts.
- `parseAmount(s)`: strip everything except digits/`.`/`-`, `parseFloat`, then **negate** (`-amount`); returns `null` on `NaN`.
- `extractLocation(s)`: first line of a multiline value, trimmed and title-cased; `undefined` when empty.

**Per-row validation** (`column-map/validation.ts`) builds:

```
ParsedTransaction = {
  date, description, amount, account,
  location?, rawRow, checksum
}
```

- `rawRow` = `JSON.stringify(row)` (the full original CSV row, preserved for audit/AI context).
- `checksum` = `SHA256(rawRow)` (`crypto-js`).
- `account` is currently the literal `"Amex"` for every row — a placeholder, not bank-derived (correct per-bank accounts are deferred to the ideas file).

## Deduplication (backend)

The wire receives already-parsed `ParsedTransaction[]`; the pillar owns no CSV/PDF transformers. `/imports/process` partitions the batch by checksum before any entity matching.

- `findExistingChecksums(db, checksums)` (`db/services/imports.ts`): batches the checksum list in groups of **500** (`SQLITE_MAX_VARIABLE_NUMBER` headroom) and runs `SELECT checksum FROM transactions WHERE checksum IN (...)` per batch, returning the set of checksums that already exist. Empty input short-circuits with no query.
- Duplicates → `skipped` bucket with `entity.matchType: 'none'`, `status: 'skipped'`, `skipReason: 'Duplicate transaction (checksum match)'`.
- New rows → proceed to entity matching.

### Data model

`transactions.checksum text` with `uniqueIndex('idx_transactions_checksum')`. `rawRow` is persisted alongside for audit/AI context. Location lives as a normal value on the transaction — there is no online/in-person field; online-vs-in-person, when wanted, is a tag via `transaction_tag_rules`.

### Why checksums work

Bank CSV rows are deterministic: the same transaction exports the identical row, so `SHA256(rawRow)` is stable. Re-importing the same file yields the same checksums and every row is skipped. The hash covers all fields, so there is no date/amount ambiguity.

## REST surface

- `POST /imports/process` — body `{ transactions: ParsedTransaction[], account }`; dedups by checksum, runs entity matching on the survivors, returns `{ sessionId }` to poll. Background work; FE polls `GET /imports/progress?sessionId`.
- `POST /webhooks/up` / `POST /webhooks/up/ping` — Up Bank webhook endpoints (raw Express, HMAC-signature-verified). Currently log-only; persistence is deferred (ideas file).

## Business rules

- The `idx_transactions_checksum` unique index enforces dedup at the DB level; the in-process probe avoids round-tripping rows that would be rejected anyway.
- Re-importing the same CSV skips every row — import is idempotent.
- Rows that fail to parse (bad date/amount, or unmapped required columns) are reported as validation errors in the column-map step; the first 10 are surfaced.
- `rawRow` is preserved verbatim for audit and AI context.

## Edge cases

| Case                                           | Behaviour                                                                                                |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Bank changes CSV format                        | Auto-detect may miss columns; user remaps manually, or rows fail validation and show as errors in step 2 |
| Manual CSV edit (amount changed)               | Different `rawRow` → different checksum → treated as a new transaction                                   |
| Same amount + day, different merchant          | Different raw rows → different checksums → no false dedup                                                |
| Transaction with a null checksum already in DB | Ignored by `findExistingChecksums` (only non-null checksums match)                                       |
| > 500 transactions in one import               | Checksum probe batches at 500 to stay under the SQLite variable limit                                    |

## Acceptance criteria

- [x] Each `ParsedTransaction` carries `SHA256(JSON.stringify(row))` as its checksum.
- [x] `findExistingChecksums` batches the IN-list at 500 and returns only checksums already present; empty input returns an empty set without querying; null-checksum rows are ignored.
- [x] Duplicate rows land in the `skipped` bucket with reason `"Duplicate transaction (checksum match)"`; new rows continue to entity matching.
- [x] `transactions.checksum` has a unique index (`idx_transactions_checksum`).
- [x] CSV is parsed client-side (Papa Parse) into `{ headers, rows }`; columns auto-detect with manual override; required = Date/Description/Amount.
- [x] `parseDate` converts `DD/MM/YYYY` → `YYYY-MM-DD`; `parseAmount` strips currency symbols and negates; `extractLocation` title-cases the first line.
- [x] Validation rejects rows with an invalid date or amount and surfaces the first 10 errors.
- [x] `rawRow` (full original row JSON) is stored for audit/AI context.
- [x] Tests cover `findExistingChecksums` (existing/missing/null/over-500-batch), plus `buildEntityMaps`, `buildDefaultTagsByEntity`, and `insertImportTransaction` (`src/db/__tests__/imports.test.ts`).
- [ ] The client-side column-map transforms (`parseDate`/`parseAmount`/`extractLocation`/`autoDetectColumns`/`validateAllRows`) are shipped but have no unit tests yet — open test gap, not a missing feature.

## Out of scope

- Per-bank parsers and ANZ PDF (Amex sign inversion, ANZ correct-sign, ING credit/debit, PDF statements) → `docs/ideas/per-bank-parsers.md`.
- Up Bank API batch import and webhook persistence → `docs/ideas/up-bank-api-import.md`.
- Entity matching, import wizard UI (separate PRDs).
