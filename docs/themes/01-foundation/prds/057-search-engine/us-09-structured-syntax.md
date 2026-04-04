# US-09: Structured query syntax

> PRD: [057 — Search Engine](README.md)
> Status: Not started

## Description

As a power user, I want typed filter syntax in search queries so that I can narrow results precisely.

## Acceptance Criteria

- [ ] Parser extracts structured tokens: `type:movie year:>2000 fight` → type filter "movie", year filter ">2000", text query "fight"
- [ ] Supported filters: `type:`, `domain:`, `year:>`, `year:<`, `value:>`, `value:<`, `warranty:expiring`
- [ ] Filters passed to relevant domain adapters (type/year → media, value/warranty → inventory)
- [ ] Unrecognised filters treated as plain text (no errors)
- [ ] Combined with context ordering — filters narrow, context orders
- [ ] Test: `type:movie year:>2000 fight` returns Fight Club (1999 excluded by year filter)

## Notes

v2 feature — plain text search works first (US-01 through US-08b). Structured syntax is a progressive enhancement. Parser should be simple regex token extraction, not a full query language.
