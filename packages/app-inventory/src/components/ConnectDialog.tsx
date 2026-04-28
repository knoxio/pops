import { Link2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';
import { AssetIdBadge, Button, SearchPickerDialog, TypeBadge } from '@pops/ui';

import type { InventoryItem } from '@pops/api/modules/inventory/items/types';

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
  const { t } = useTranslation('inventory');
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
          <span className="text-xs text-muted-foreground mt-0.5">{t('connections.noDetails')}</span>
        )}
      </div>
      <Link2 className="h-4 w-4 text-muted-foreground shrink-0 ml-2" />
    </Button>
  );
}

export function ConnectDialog({ currentItemId, onConnected }: ConnectDialogProps) {
  const { t } = useTranslation('inventory');
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = trpc.inventory.items.list.useQuery(
    { search, limit: 10 },
    { enabled: open && search.length >= 2 }
  );

  const connectMutation = trpc.inventory.connections.connect.useMutation({
    onSuccess: () => {
      toast.success(t('connections.itemsConnected'));
      onConnected();
      setOpen(false);
      setSearch('');
    },
    onError: (err) => {
      if (err.data?.code === 'CONFLICT') {
        toast.error(t('connections.alreadyConnected'));
      } else {
        toast.error(t('connections.failedToConnect', { message: err.message }));
      }
    },
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
      title={t('connections.connectItem')}
      description={t('connections.searchDescription')}
      searchPlaceholder={t('connections.searchPlaceholder')}
      emptyMessage={t('connections.noItemsFound')}
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
