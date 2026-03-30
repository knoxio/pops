# US-04: Print layout

> PRD: [051 — Value & Insurance Reporting](README.md)
> Status: Partial

## Description

As a user, I want to print the insurance report as a clean PDF via the browser's print function so that I can provide a physical or digital copy to my insurance provider.

## Acceptance Criteria

- [x] `@media print` CSS applied to the report page
- [x] Print layout hides: navigation, sidebar, dashboard widgets, value breakdowns, report controls (location selector, sort, generate button)
- [x] Print layout shows: report header, item list, summary section only
- [x] Report header prints: "POPS Inventory Report — [location or Full Inventory] — [date]"
- [ ] Items grouped by location with location name as section header (when printing full inventory) — not implemented
- [ ] `page-break-before` on each location section to start a new page per location — not implemented
- [ ] Item photos sized to max 200px width in print — prevents oversized images — currently set to 8px
- [ ] Photos use `break-inside: avoid` to prevent splitting a photo across pages — missing
- [ ] Item rows use `break-inside: avoid` to prevent splitting a row across pages — missing
- [ ] Summary section prints at the end, preceded by a page break if needed — page break missing
- [ ] Font size optimised for print: 11-12pt body text, 14pt section headers — not set
- [ ] Colours adjusted for print: no background colours on tier indicators, borders for table structure — not set
- [x] "Print Report" button (`window.print()`) triggers the browser's native print dialog
- [ ] Print preview matches the final output (tested in Chrome and Safari) — not verified

## Notes

No server-side PDF generation — browser print-to-PDF handles everything. The print CSS is a separate stylesheet or a `@media print` block within the report page's styles. Test with Chrome's print preview to verify page breaks and photo sizing behave correctly. Safari's print engine renders slightly differently — verify both.
