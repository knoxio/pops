import { Link2, Search, X } from 'lucide-react';

import { Badge, Button, Skeleton, TextInput } from '@pops/ui';

import type { InventoryItem } from '@pops/api/modules/inventory/items/types';

import type { PendingConnection } from '../useItemFormPageModel';

interface ConnectionsSectionProps {
  pendingConnections: PendingConnection[];
  connectionSearch: string;
  searchResults: { data: InventoryItem[] } | undefined;
  searchLoading: boolean;
  onSearchChange: (value: string) => void;
  onAdd: (item: InventoryItem) => void;
  onRemove: (id: string) => void;
}

function PendingBadges({
  pendingConnections,
  onRemove,
}: {
  pendingConnections: PendingConnection[];
  onRemove: (id: string) => void;
}) {
  if (pendingConnections.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {pendingConnections.map((conn) => (
        <Badge
          key={conn.id}
          variant="secondary"
          className="flex items-center gap-1.5 pl-3 pr-1.5 py-1 bg-app-accent/10 text-app-accent border-app-accent/20"
        >
          {conn.itemName}
          <Button
            variant="ghost"
            size="icon"
            className="rounded-full hover:bg-app-accent/20"
            onClick={() => onRemove(conn.id)}
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}
    </div>
  );
}

function SearchResults({
  loading,
  filtered,
  onPick,
}: {
  loading: boolean;
  filtered: InventoryItem[];
  onPick: (item: InventoryItem) => void;
}) {
  if (loading) {
    return (
      <div className="space-y-2 p-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (filtered.length === 0) {
    return <p className="text-sm text-muted-foreground py-3 text-center">No items found</p>;
  }
  return (
    <>
      {filtered.map((item) => (
        <Button
          key={item.id}
          variant="ghost"
          className="w-full flex items-center justify-between p-2.5 h-auto text-left"
          onClick={() => onPick(item)}
        >
          <div>
            <div className="font-medium text-sm">{item.itemName}</div>
            <div className="text-xs text-muted-foreground">
              {[item.brand, item.model, item.assetId].filter(Boolean).join(' · ') || 'No details'}
            </div>
          </div>
          <Link2 className="h-4 w-4 text-app-accent/50 shrink-0 ml-2" />
        </Button>
      ))}
    </>
  );
}

export function ConnectionsSection({
  pendingConnections,
  connectionSearch,
  searchResults,
  searchLoading,
  onSearchChange,
  onAdd,
  onRemove,
}: ConnectionsSectionProps) {
  const pendingIds = new Set(pendingConnections.map((c) => c.id));
  const filtered =
    searchResults?.data.filter((item: InventoryItem) => !pendingIds.has(item.id)) ?? [];

  return (
    <section className="space-y-4 p-6 rounded-2xl border-2 border-app-accent/10 bg-card/50 shadow-sm shadow-app-accent/5">
      <h2 className="text-lg font-bold flex items-center gap-2 text-foreground">
        <Link2 className="h-5 w-5 text-app-accent" />
        Connected Items
      </h2>
      <PendingBadges pendingConnections={pendingConnections} onRemove={onRemove} />
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <TextInput
          value={connectionSearch}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search items to connect..."
          className="pl-9"
        />
      </div>
      {connectionSearch.length >= 2 && (
        <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
          <SearchResults
            loading={searchLoading}
            filtered={filtered}
            onPick={(item) => {
              onAdd(item);
              onSearchChange('');
            }}
          />
        </div>
      )}
    </section>
  );
}
