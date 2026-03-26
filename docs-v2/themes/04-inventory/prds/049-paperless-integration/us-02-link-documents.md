# US-02: Link documents

> PRD: [049 — Paperless-ngx Integration](README.md)
> Status: To Review

## Description

As a user, I want to search Paperless-ngx documents and link them to inventory items so that I can attach receipts, warranties, and manuals to my items.

## Acceptance Criteria

- [ ] "Link Document" button on item detail page — only visible when Paperless health check returns `available: true`
- [ ] Clicking "Link Document" opens a search modal
- [ ] Search input with debounced query (300ms) — calls `inventory.documents.search`
- [ ] Search results show: thumbnail, title, created date, correspondent — one row per document
- [ ] Selecting a document shows a tag selector: "Receipt", "Warranty", "Manual"
- [ ] Confirming selection calls `inventory.documents.link` with itemId, paperlessDocId, and tag
- [ ] Duplicate link attempt shows toast error ("This document is already linked to this item")
- [ ] Document appears in the item's document section immediately after linking
- [ ] "Unlink" button on each linked document — confirmation: "Unlink [title]?" — calls `inventory.documents.unlink`
- [ ] Toast confirmation on successful link and unlink
- [ ] Empty search results: "No documents found in Paperless"
- [ ] Loading state while search runs
- [ ] Modal closes after successful link

## Notes

The search modal queries Paperless via the POPS API proxy (not directly). Thumbnails in search results are loaded via the thumbnail proxy endpoint. The tag selector is a simple radio group — default to "receipt" since that's the most common use case.
