# US-02: Upload step

> PRD: [020 — Import Wizard UI](README.md)
> Status: To Review

## Description

As a user, I want to upload a bank CSV file so that I can begin importing transactions.

## Acceptance Criteria

- [ ] File input accepts CSV files (max 25 MB)
- [ ] CSV parsed client-side with PapaParse (header: true, skip empty lines)
- [ ] Headers and rows extracted and stored in Zustand
- [ ] Validation: file required, CSV not empty, headers present
- [ ] Error messaging for invalid files
- [ ] On success: stores headers/rows and advances to Step 2
- [ ] Loading state while parsing large files

## Notes

Parsing happens entirely client-side — no upload to server at this stage. The raw CSV data stays in the browser until Step 3 sends parsed transactions to the backend.
