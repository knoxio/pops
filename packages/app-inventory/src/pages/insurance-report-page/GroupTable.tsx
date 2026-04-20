import { AssetIdBadge, Badge, type Condition, ConditionBadge, formatAUD } from '@pops/ui';

import { warrantyStatus } from './warranty';

import type { ReportGroup, ReportItem } from './csv';

const TH_CLASS = 'py-2 pr-3 print:border print:border-gray-300 print:p-1';
const TD_CLASS = 'py-2 pr-3 print:border print:border-gray-300 print:p-1';

function PhotoCell({ item }: { item: ReportItem }) {
  if (item.photoPath) {
    return (
      <img
        src={`/inventory/photos/${item.photoPath}`}
        alt={`Photo of ${item.itemName}`}
        className="w-8 h-8 rounded object-cover print:w-auto print:h-auto print:max-w-50 print:break-inside-avoid"
      />
    );
  }
  return (
    <div
      className="w-8 h-8 rounded bg-muted print:bg-gray-100"
      role="img"
      aria-label="No photo available"
    />
  );
}

function ItemRow({ item, onOpen }: { item: ReportItem; onOpen: (id: string) => void }) {
  const warranty = warrantyStatus(item.warrantyExpires);
  return (
    <tr
      className="border-b last:border-0 hover:bg-muted/30 cursor-pointer print:hover:bg-transparent print:cursor-default print:break-inside-avoid print:border-gray-300"
      onClick={() => onOpen(item.id)}
    >
      <td className={TD_CLASS}>
        <PhotoCell item={item} />
      </td>
      <td className={`${TD_CLASS} font-medium print:text-[12pt]`}>{item.itemName}</td>
      <td className={`${TD_CLASS} [&_span]:print:bg-transparent [&_span]:print:text-black`}>
        {item.assetId ? (
          <AssetIdBadge assetId={item.assetId} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={TD_CLASS}>{item.brand ?? '—'}</td>
      <td className={`${TD_CLASS} [&_span]:print:bg-transparent [&_span]:print:text-black`}>
        {item.condition ? (
          <ConditionBadge condition={item.condition as Condition} />
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className={TD_CLASS}>
        <Badge
          variant={warranty.variant}
          className="print:bg-transparent print:border print:border-gray-400 print:text-black"
        >
          {warranty.label}
        </Badge>
      </td>
      <td className={`${TD_CLASS} text-right tabular-nums`}>
        {item.replacementValue != null ? formatAUD(item.replacementValue) : '—'}
      </td>
      <td className={`${TD_CLASS} text-sm text-muted-foreground`}>
        {item.receiptDocumentIds.length > 0
          ? item.receiptDocumentIds.map((id) => `#${id}`).join(', ')
          : '—'}
      </td>
    </tr>
  );
}

function GroupHeader({ group }: { group: ReportGroup }) {
  return (
    <h2 className="text-lg font-semibold mb-3 pb-1 border-b print:text-[14pt]">
      {group.locationName}
      <span className="ml-2 text-sm font-normal text-muted-foreground">
        ({group.items.length} {group.items.length === 1 ? 'item' : 'items'})
      </span>
    </h2>
  );
}

function GroupTableHead() {
  return (
    <thead>
      <tr className="border-b text-left text-muted-foreground print:border-gray-300">
        <th className={`${TH_CLASS} w-10`}>Photo</th>
        <th className={TH_CLASS}>Name</th>
        <th className={TH_CLASS}>Asset ID</th>
        <th className={TH_CLASS}>Brand</th>
        <th className={TH_CLASS}>Condition</th>
        <th className={TH_CLASS}>Warranty</th>
        <th className={`${TH_CLASS} text-right`}>Value</th>
        <th className={TH_CLASS}>Receipts</th>
      </tr>
    </thead>
  );
}

function GroupTableFoot({ items }: { items: ReportItem[] }) {
  if (!items.some((i) => i.replacementValue != null)) return null;
  return (
    <tfoot>
      <tr className="font-semibold">
        <td colSpan={7} className="py-2 pr-3 text-right">
          Subtotal
        </td>
        <td className="py-2 pr-3 text-right tabular-nums">
          {formatAUD(items.reduce((sum, i) => sum + (i.replacementValue ?? 0), 0))}
        </td>
      </tr>
    </tfoot>
  );
}

interface GroupTableProps {
  group: ReportGroup;
  groupIndex: number;
  onOpenItem: (id: string) => void;
}

export function GroupTable({ group, groupIndex, onOpenItem }: GroupTableProps) {
  return (
    <div className={`mb-8 print:mb-4 ${groupIndex > 0 ? 'print:break-before-page' : ''}`}>
      <GroupHeader group={group} />
      <div className="overflow-x-auto">
        <table className="w-full text-sm print:text-[11pt] print:border-collapse print:border print:border-gray-300">
          <GroupTableHead />
          <tbody>
            {group.items.map((item) => (
              <ItemRow key={item.id} item={item} onOpen={onOpenItem} />
            ))}
          </tbody>
          <GroupTableFoot items={group.items} />
        </table>
      </div>
    </div>
  );
}
