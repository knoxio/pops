# Idea: Richer per-item detail in the insurance report

The shipped insurance report (`GET /reports/insurance`) returns, per item: name,
asset id, brand, type, condition, warranty expiry, replacement value, photo and
linked receipt ids. The original spec also asked for three fields that were never
wired through the contract or handler:

- **Resale value per item** — today only the _dashboard_ exposes a `totalResaleValue`
  aggregate. The per-item report and CSV carry replacement value only. Insurance
  packets sometimes want both figures side by side.
- **Model** — `home_inventory.model` exists on the item record but is not surfaced
  in the report row, the print table, or the CSV.
- **Purchase date** — likewise present on the item but absent from the report
  output and the "warranty status" line, which currently derives only from
  `warrantyExpires`.

To build later:

- Extend `InsuranceReportItemSchema` (`rest-reports.ts`) and `toReportItem`
  (`api/modules/reports/insurance-report.ts`) to include `resaleValue`, `model`
  and `purchaseDate`, all nullable.
- Add the columns to `GroupTable` (with em-dash fallbacks and print styling) and
  to the CSV `HEADERS` / row builder.
- Decide whether the summary panel should show a total resale value alongside the
  total replacement value.

Forward-looking only — not built. Carved out of the original
Value & Insurance Reporting PRD, whose per-item spec over-claimed these fields.
