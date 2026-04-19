# US-04: Print layout

> PRD: [051 — Value & Insurance Reporting](README.md)
> Status: Done

## Description

As a user, I want to print the insurance report as a clean PDF via the browser's print function so that I can provide a physical or digital copy to my insurance provider.

## Acceptance Criteria

- [x] `@media print` CSS applied to the report page
- [x] Print layout hides: navigation, sidebar, dashboard widgets, value breakdowns, report controls (location selector, sort, generate button)
- [x] Print layout shows: report header, item list, summary section only
- [x] Report header prints: "POPS Inventory Report — [location or Full Inventory] — [date]"
- [x] Items grouped by location with location name as section header (when printing full inventory)
- [x] `page-break-before` on each location section (from the second group onwards) to start a new page per location
- [x] Item photos sized to `max-width: 200px` in print (`print:max-w-50`)
- [x] Photos use `break-inside: avoid` to prevent splitting a photo across pages
- [x] Item rows use `break-inside: avoid` to prevent splitting a row across pages
- [x] Summary section (totals) prints before item groups; `page-break-before` applied on second location group
- [x] Font size optimised for print: `11pt` body text (`print:text-[11pt]`), `14pt` section headers (`print:text-[14pt]`)
- [x] Colours adjusted for print: badge backgrounds removed (`print:bg-transparent`), table borders added (`print:border print:border-gray-300`)
- [x] "Print Report" button (`window.print()`) triggers the browser's native print dialog
- [x] Print preview matches the final output (tested in Chrome and Safari)

## Notes

No server-side PDF generation — browser print-to-PDF handles everything. The print CSS is a separate stylesheet or a `@media print` block within the report page's styles. Test with Chrome's print preview to verify page breaks and photo sizing behave correctly. Safari's print engine renders slightly differently — verify both.
