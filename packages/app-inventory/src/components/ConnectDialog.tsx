import { Link2, Search } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

/**
 * ConnectDialog — search and connect inventory items.
 * Opens a dialog with a search input that queries inventory.items.list,
 * displays results, and connects the selected item.
 */
import {
  AssetIdBadge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Skeleton,
  TextInput,
  TypeBadge,
} from '@pops/ui';

import { trpc } from '../lib/trpc';

import type { InventoryItem } from '@pops/api/modules/inventory/items/types';

interface ConnectDialogProps {
  currentItemId: string;
  onConnected: () => void;
}

export function ConnectDialog({ currentItemId, onConnected }: ConnectDialogProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const { data, isLoading } = trpc.inventory.items.list.useQuery(
    { search, limit: 10 },
    { enabled: open && search.length >= 2 }
  );

  const connectMutation = trpc.inventory.connections.connect.useMutation({
    onSuccess: () => {
      toast.success('Items connected');
      onConnected();
      setOpen(false);
      setSearch('');
    },
    onError: (err) => {
      if (err.data?.code === 'CONFLICT') {
        toast.error('These items are already connected');
      } else {
        toast.error(`Failed to connect: ${err.message}`);
      }
    },
  });

  const handleConnect = (targetId: string) => {
    connectMutation.mutate({ itemAId: currentItemId, itemBId: targetId });
  };

  // Filter out the current item from results
  const results = data?.data.filter((item: InventoryItem) => item.id !== currentItemId) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setSearch('');
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Link2 className="h-4 w-4 mr-1.5" />
          Connect Item
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Connect Item</DialogTitle>
          <DialogDescription>Search for an item to connect by name or asset ID.</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <TextInput
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder="Search items..."
            className="pl-9"
            autoFocus
          />
        </div>

        <div className="max-h-64 overflow-y-auto space-y-1">
          {search.length < 2 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              Type at least 2 characters to search
            </p>
          ) : isLoading ? (
            <div className="space-y-2 py-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : results.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No items found</p>
          ) : (
            results.map((item: InventoryItem) => (
              <Button
                key={item.id}
                variant="ghost"
                className="w-full flex items-center justify-between p-2.5 h-auto text-left"
                onClick={() => {
                  handleConnect(item.id);
                }}
                disabled={connectMutation.isPending}
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm">{item.itemName}</div>
                  {item.brand || item.model || item.assetId || item.type ? (
                    <div className="flex flex-wrap items-center gap-1 mt-0.5">
                      {(item.brand || item.model) && (
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
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
