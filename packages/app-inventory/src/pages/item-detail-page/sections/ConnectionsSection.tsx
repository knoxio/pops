import { GitBranch, Link2, Network, Unlink } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';

import { trpc } from '@pops/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AssetIdBadge,
  Button,
  Skeleton,
  TypeBadge,
} from '@pops/ui';

import { ConnectDialog } from '../../../components/ConnectDialog';
import { ConnectionGraph } from '../../../components/ConnectionGraph';
import { ConnectionTracePanel } from '../../../components/ConnectionTracePanel';

import type { ItemConnection } from '@pops/api/modules/inventory/connections/types';

function ConnectionRow({
  connectedItemId,
  onDisconnect,
  isDisconnecting,
}: {
  connectedItemId: string;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  const { data } = trpc.inventory.items.get.useQuery({ id: connectedItemId });
  const item = data?.data;
  const itemName = item?.itemName ?? connectedItemId;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <Link to={`/inventory/items/${connectedItemId}`} className="flex-1 min-w-0 hover:underline">
        <span className="font-medium">{itemName}</span>
        {item?.brand && <span className="text-muted-foreground text-sm ml-2">{item.brand}</span>}
        {(item?.assetId || item?.type) && (
          <div className="flex flex-wrap items-center gap-1 mt-0.5">
            {item.assetId && <AssetIdBadge assetId={item.assetId} />}
            {item.type && <TypeBadge type={item.type} />}
          </div>
        )}
      </Link>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive shrink-0"
            disabled={isDisconnecting}
            title="Disconnect"
            aria-label="Disconnect"
          >
            <Unlink className="h-4 w-4" />
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect {itemName}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the connection between these items.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDisconnect}>Disconnect</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

interface ConnectionsSectionProps {
  itemId: string;
  connections: ItemConnection[];
  connectionsLoading: boolean;
  isDisconnecting: boolean;
  onConnected: () => void;
  onDisconnect: (conn: ItemConnection) => void;
}

interface ConnectedItemsListProps {
  itemId: string;
  connections: ItemConnection[];
  connectionsLoading: boolean;
  isDisconnecting: boolean;
  onDisconnect: (conn: ItemConnection) => void;
}

function ConnectedItemsList({
  itemId,
  connections,
  connectionsLoading,
  isDisconnecting,
  onDisconnect,
}: ConnectedItemsListProps) {
  if (connectionsLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }
  if (!connections.length) {
    return <p className="text-muted-foreground text-sm">No connected items yet.</p>;
  }
  return (
    <div className="space-y-2">
      {connections.map((conn) => (
        <ConnectionRow
          key={conn.id}
          connectedItemId={conn.itemAId === itemId ? conn.itemBId : conn.itemAId}
          onDisconnect={() => onDisconnect(conn)}
          isDisconnecting={isDisconnecting}
        />
      ))}
    </div>
  );
}

function ConnectionChainSection({ itemId }: { itemId: string }) {
  const [showGraph, setShowGraph] = useState(false);
  return (
    <section>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <GitBranch className="h-5 w-5" />
          Connection Chain
        </h2>
        <Button variant="outline" size="sm" onClick={() => setShowGraph((v) => !v)}>
          <Network className="h-4 w-4 mr-1.5" />
          {showGraph ? 'Hide Graph' : 'View Graph'}
        </Button>
      </div>
      {showGraph ? <ConnectionGraph itemId={itemId} /> : <ConnectionTracePanel itemId={itemId} />}
    </section>
  );
}

export function ConnectionsSection({
  itemId,
  connections,
  connectionsLoading,
  isDisconnecting,
  onConnected,
  onDisconnect,
}: ConnectionsSectionProps) {
  return (
    <>
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Connected Items
          </h2>
          <ConnectDialog currentItemId={itemId} onConnected={onConnected} />
        </div>
        <ConnectedItemsList
          itemId={itemId}
          connections={connections}
          connectionsLoading={connectionsLoading}
          isDisconnecting={isDisconnecting}
          onDisconnect={onDisconnect}
        />
      </section>
      {connections.length ? <ConnectionChainSection itemId={itemId} /> : null}
    </>
  );
}
