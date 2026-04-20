export interface ReportItem {
  id: string;
  itemName: string;
  assetId: string | null;
  brand: string | null;
  condition: string | null;
  warrantyExpires: string | null;
  replacementValue: number | null;
  photoPath: string | null;
  locationId: string | null;
  locationName: string | null;
  receiptDocumentIds: number[];
}

export interface ReportGroup {
  locationId: string | null;
  locationName: string;
  items: ReportItem[];
}

const HEADERS = [
  'Location',
  'Name',
  'Asset ID',
  'Brand',
  'Condition',
  'Warranty Expires',
  'Replacement Value',
  'Photo',
  'Receipts',
];

export function buildCsvContent(groups: ReportGroup[]): string {
  const rows: string[][] = [HEADERS];
  for (const group of groups) {
    for (const item of group.items) {
      rows.push([
        group.locationName,
        item.itemName,
        item.assetId ?? '',
        item.brand ?? '',
        item.condition ?? '',
        item.warrantyExpires ?? '',
        item.replacementValue != null ? String(item.replacementValue) : '',
        item.photoPath ? 'Yes' : 'No',
        item.receiptDocumentIds.map((id) => `#${id}`).join(', '),
      ]);
    }
  }
  return rows
    .map((row) => row.map((cell) => `"${cell.replaceAll(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function downloadCsv(groups: ReportGroup[]): void {
  const csv = buildCsvContent(groups);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `insurance-report-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
