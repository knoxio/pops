import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { usePillarMutation, usePillarQuery } from '@pops/pillar-sdk/react';
import { AssetIdBadge, Button, SearchPickerDialog, TypeBadge } from '@pops/ui';

import type { InventoryItem } from '@pops/api/modules/inventory/items/types';

interface ItemsListResult {
  data: InventoryItem[];
}

type ConnectInput = { itemAId: string; itemBId: string };

interface ConnectDialogProps {
  currentItemId: string;
  onConnected: () => void;
}

interface ConnectResultRowProps {
  item: InventoryItem;
  disabled: boolean;
  onConnect: (itemId: string) => void;
}

function ConnectResultRow({ item, disabled, onConnect }: ConnectResultRowProps) {
  const hasMeta = ((item.brand ?? item.model) || item.assetId) ?? item.type;
  return (
    <Button
      variant="ghost"
      className="w-full flex items-center justify-between p-2.5 h-auto text-left"
      onClick={() => onConnect(item.id)}
      disabled={disabled}
    >
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm">{item.itemName}</div>
        {hasMeta ? (
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            {(item.brand ?? item.model) && (
              <span className="text-xs text-muted-foreground">
                {[item.brand, item.model].filter(Boolean).join(' · ')}
              </span>
            )}
            {item.assetId && <AssetIdBadge assetId={item.assetId} />}
            {item.type && <TypeBadge type={item.type} />}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground mt-0.5">No details</span>
        )}
      </div>
      <Link2 className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
    </Button>
  );
}

function useConnectMutation(onSuccess: () => void) {
  return usePillarMutation<ConnectInput, unknown>('inventory', ['connections', 'connect'], {
    onSuccess,
    onError: (err) => {
      if (err.message.toLowerCase().includes('conflict')) {
        toast.error('These items are already connected');
      } else {
        toast.error(`Failed to connect: ${err.message}`);
      }
    },
  });
}

export function ConnectDialog({ currentItemId, onConnected }: ConnectDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = usePillarQuery<ItemsListResult>(
    'inventory',
    ['items', 'list'],
    { search, limit: 10 },
    { enabled: open && search.length >= 2 }
  );

  const connectMutation = useConnectMutation(() => {
    toast.success('Items connected');
    onConnected();
    setOpen(false);
    setSearch('');
  });

  const results = data?.data.filter((item: InventoryItem) => item.id !== currentItemId) ?? [];

  return (
    <SearchPickerDialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch('');
      }}
      trigger={
        <Button variant="outline" size="sm">
          <Link2 className="h-4 w-4 mr-1.5" />
          Connect Item
        </Button>
      }
      title="Connect Item"
      description="Search for an item to connect by name or asset ID."
      searchPlaceholder="Search items..."
      emptyMessage="No items found"
      getResultKey={(item: InventoryItem) => item.id}
      search={search}
      onSearchChange={setSearch}
      isLoading={isLoading}
      results={results}
      renderResult={(item: InventoryItem) => (
        <ConnectResultRow
          item={item}
          disabled={connectMutation.isPending}
          onConnect={(itemBId) => connectMutation.mutate({ itemAId: currentItemId, itemBId })}
        />
      )}
    />
  );
}
