/**
 * Item detail page — shows item info and connected items.
 * Route: /inventory/items/:id
 */
import { useParams, Link } from "react-router";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Alert,
  AlertTitle,
  AlertDescription,
  Skeleton,
} from "@pops/ui";
import { ArrowLeft, Pencil, Link2, Unlink } from "lucide-react";
import { trpc } from "../lib/trpc";
import { ConnectDialog } from "../components/ConnectDialog";

export function ItemDetailPage() {
  const { id } = useParams<{ id: string }>();
  const utils = trpc.useUtils();

  const {
    data: itemData,
    isLoading,
    error,
  } = trpc.inventory.items.get.useQuery({ id: id! }, { enabled: !!id });

  const { data: connectionsData, isLoading: connectionsLoading } =
    trpc.inventory.connections.listForItem.useQuery(
      { itemId: id! },
      { enabled: !!id },
    );

  const disconnectMutation = trpc.inventory.connections.disconnect.useMutation({
    onSuccess: () => {
      toast.success("Items disconnected");
      void utils.inventory.connections.listForItem.invalidate({ itemId: id! });
    },
    onError: (err) => {
      toast.error(`Failed to disconnect: ${err.message}`);
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 space-y-6 max-w-3xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-2 gap-4">
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
          <Skeleton className="h-20" />
        </div>
      </div>
    );
  }

  if (error) {
    const is404 = error.data?.code === "NOT_FOUND";
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertTitle>{is404 ? "Item not found" : "Error"}</AlertTitle>
          <AlertDescription>
            {is404 ? "This item doesn't exist." : error.message}
          </AlertDescription>
        </Alert>
        <Link
          to="/inventory"
          className="mt-4 inline-block text-sm text-primary underline"
        >
          Back to inventory
        </Link>
      </div>
    );
  }

  if (!itemData) return null;

  const item = itemData.data;

  return (
    <div className="p-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link to="/inventory">
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold">{item.itemName}</h1>
          {(item.brand || item.model) && (
            <p className="text-muted-foreground">
              {[item.brand, item.model].filter(Boolean).join(" ")}
            </p>
          )}
        </div>
        <Link to={`/inventory/items/${id}/edit`}>
          <Button variant="outline" size="sm">
            <Pencil className="h-4 w-4 mr-1.5" />
            Edit
          </Button>
        </Link>
      </div>

      {/* Details */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {item.type && <DetailField label="Type" value={item.type} />}
        {item.condition && (
          <DetailField
            label="Condition"
            value={<Badge variant="secondary">{item.condition}</Badge>}
          />
        )}
        {item.room && <DetailField label="Room" value={item.room} />}
        {item.itemId && <DetailField label="Item ID" value={item.itemId} />}
        {item.assetId && <DetailField label="Asset ID" value={item.assetId} />}
        <DetailField label="In Use" value={item.inUse ? "Yes" : "No"} />
        <DetailField
          label="Tax Deductible"
          value={item.deductible ? "Yes" : "No"}
        />
        {item.purchaseDate && (
          <DetailField label="Purchase Date" value={item.purchaseDate} />
        )}
        {item.warrantyExpires && (
          <DetailField label="Warranty Expires" value={item.warrantyExpires} />
        )}
        {item.replacementValue !== null && (
          <DetailField
            label="Replacement Value"
            value={`$${item.replacementValue.toFixed(2)}`}
          />
        )}
        {item.resaleValue !== null && (
          <DetailField
            label="Resale Value"
            value={`$${item.resaleValue.toFixed(2)}`}
          />
        )}
      </div>

      {item.notes && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Notes</h2>
          <p className="text-muted-foreground whitespace-pre-wrap">
            {item.notes}
          </p>
        </div>
      )}

      {/* Connections */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Connected Items
          </h2>
          <ConnectDialog
            currentItemId={id!}
            onConnected={() => {
              void utils.inventory.connections.listForItem.invalidate({
                itemId: id!,
              });
            }}
          />
        </div>

        {connectionsLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : connectionsData?.data.length ? (
          <div className="space-y-2">
            {connectionsData.data.map((conn) => (
              <ConnectionRow
                key={conn.id}
                connectionId={conn.id}
                connectedItemId={
                  conn.itemAId === id ? conn.itemBId : conn.itemAId
                }
                onDisconnect={() => disconnectMutation.mutate({ id: conn.id })}
                isDisconnecting={disconnectMutation.isPending}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            No connected items yet.
          </p>
        )}
      </section>
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function ConnectionRow({
  connectionId,
  connectedItemId,
  onDisconnect,
  isDisconnecting,
}: {
  connectionId: number;
  connectedItemId: string;
  onDisconnect: () => void;
  isDisconnecting: boolean;
}) {
  const { data } = trpc.inventory.items.get.useQuery({ id: connectedItemId });
  const item = data?.data;

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border">
      <Link
        to={`/inventory/items/${connectedItemId}`}
        className="flex-1 hover:underline"
      >
        <span className="font-medium">{item?.itemName ?? connectedItemId}</span>
        {item?.brand && (
          <span className="text-muted-foreground text-sm ml-2">
            {item.brand}
          </span>
        )}
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-destructive hover:text-destructive"
        onClick={onDisconnect}
        disabled={isDisconnecting}
        title="Disconnect"
      >
        <Unlink className="h-4 w-4" />
      </Button>
    </div>
  );
}
