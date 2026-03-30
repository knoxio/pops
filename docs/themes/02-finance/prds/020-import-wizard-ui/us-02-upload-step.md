# US-02: Upload step

> PRD: [020 — Import Wizard UI](README.md)
> Status: Done

## Description

As a user, I want to upload a bank CSV file so that I can begin importing transactions.

## Acceptance Criteria

- [x] File input accepts CSV files (max 25 MB)
- [x] CSV parsed client-side with PapaParse (header: true, skip empty lines)
- [x] Headers and rows extracted and stored in Zustand
- [x] Validation: file required, CSV not empty, headers present
- [x] Error messaging for invalid files
- [x] On success: stores headers/rows and advances to Step 2
- [x] Loading state while parsing large files

## Notes

Parsing happens entirely client-side — no upload to server at this stage. The raw CSV data stays in the browser until Step 3 sends parsed transactions to the backend.
