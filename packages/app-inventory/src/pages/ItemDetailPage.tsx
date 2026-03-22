/**
 * Item detail page — shows item info and connected items.
 * Route: /inventory/items/:id
 */
import { useState } from "react";
import { useParams, Link } from "react-router";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Alert,
  AlertTitle,
  AlertDescription,
  Skeleton,
  TypeBadge,
  ConditionBadge,
} from "@pops/ui";
import {
  ArrowLeft,
  Pencil,
  Link2,
  Unlink,
  GitBranch,
  FileText,
  X,
  Network,
} from "lucide-react";
import { trpc } from "../lib/trpc";

const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  receipt: "Receipts",
  warranty: "Warranties",
  manual: "Manuals",
  invoice: "Invoices",
  other: "Other",
};
import { ConnectDialog } from "../components/ConnectDialog";
import { ConnectionTracePanel } from "../components/ConnectionTracePanel";
import { LinkDocumentDialog } from "../components/LinkDocumentDialog";
import { ConnectionGraph } from "../components/ConnectionGraph";

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

  const [showGraph, setShowGraph] = useState(false);

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
          className="mt-4 inline-block text-sm text-amber-600 hover:text-amber-700 underline font-medium"
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
      <div className="flex items-center gap-3 mb-8">
        <Link to="/inventory">
          <Button variant="ghost" size="icon" className="h-9 w-9 bg-amber-500/10 text-amber-700 hover:bg-amber-500/20 hover:text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 dark:hover:bg-amber-500/30 rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight">{item.itemName}</h1>
          {(item.brand || item.model) && (
            <p className="text-muted-foreground font-medium uppercase text-xs tracking-widest opacity-80 mt-1">
              {[item.brand, item.model].filter(Boolean).join(" • ")}
            </p>
          )}
        </div>
        <Link to={`/inventory/items/${id}/edit`}>
          <Button variant="outline" size="sm" className="font-bold border-amber-500/20 hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors">
            <Pencil className="h-4 w-4 mr-2 text-amber-600 dark:text-amber-400" />
            Edit
          </Button>
        </Link>
      </div>

      {/* Details Grid */}
      <div className="bg-card border-2 border-amber-500/10 rounded-2xl overflow-hidden mb-8 shadow-sm shadow-amber-500/5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 p-6">
          {item.type && <DetailField label="Type" value={<TypeBadge type={item.type} />} />}
          {item.condition && (
            <DetailField
              label="Condition"
              value={<ConditionBadge condition={item.condition as any} />}
            />
          )}
          {item.room && <DetailField label="Room" value={item.room} />}
          {item.assetId && <DetailField label="Asset ID" value={<Badge variant="outline" className="font-mono bg-muted/50">{item.assetId}</Badge>} />}
          <DetailField label="Status" value={item.inUse ? 
            <Badge className="bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/15">In Use</Badge> : 
            <Badge variant="secondary">Stored</Badge>
          } />
          {item.purchaseDate && (
            <DetailField label="Purchased" value={new Date(item.purchaseDate).toLocaleDateString("en-AU", { year: 'numeric', month: 'short' })} />
          )}
          {item.replacementValue !== null && (
            <DetailField
              label="Replacement"
              value={<span className="text-amber-700 dark:text-amber-300 font-bold">{`$${item.replacementValue.toLocaleString()}`}</span>}
            />
          )}
        </div>
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

      {/* Connection Chain Trace */}
      {connectionsData?.data.length ? (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <GitBranch className="h-5 w-5" />
              Connection Chain
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowGraph((v) => !v)}
            >
              <Network className="h-4 w-4 mr-1.5" />
              {showGraph ? "Hide Graph" : "View Graph"}
            </Button>
          </div>
          {showGraph ? (
            <ConnectionGraph itemId={id!} />
          ) : (
            <ConnectionTracePanel itemId={id!} />
          )}
        </section>
      ) : null}

      {/* Documents — hidden when Paperless-ngx not configured */}
      <DocumentsSection itemId={id!} />
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
      <dt className="text-xs font-bold text-amber-900/60 dark:text-amber-100/60 uppercase tracking-widest mb-1">{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function DocumentsSection({ itemId }: { itemId: string }) {
  const { data: statusData, isLoading: statusLoading } =
    trpc.inventory.paperless.status.useQuery();

  const status = statusData?.data;

  // Not configured — hide entirely
  if (!statusLoading && !status?.configured) return null;

  // Loading status check
  if (statusLoading) {
    return (
      <section className="mt-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5" />
          Documents
        </h2>
        <Skeleton className="h-12 w-full" />
      </section>
    );
  }

  // Configured but unreachable
  if (!status?.available) {
    return (
      <section className="mt-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <FileText className="h-5 w-5" />
          Documents
        </h2>
        <p className="text-sm text-muted-foreground">
          Paperless-ngx unavailable
        </p>
      </section>
    );
  }

  return <DocumentsList itemId={itemId} />;
}

function DocumentsList({ itemId }: { itemId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.inventory.documents.listForItem.useQuery({
    itemId,
  });

  const unlinkMutation = trpc.inventory.documents.unlink.useMutation({
    onSuccess: () => {
      toast.success("Document unlinked");
      void utils.inventory.documents.listForItem.invalidate({ itemId });
    },
    onError: (err: { message: string }) => {
      toast.error(`Failed to unlink: ${err.message}`);
    },
  });

  // Group documents by type
  const grouped = new Map<string, typeof docs>();
  const docs = data?.data ?? [];
  for (const doc of docs) {
    const type = doc.documentType;
    const list = grouped.get(type) ?? [];
    list.push(doc);
    grouped.set(type, list);
  }

  const typeOrder = ["receipt", "warranty", "manual", "invoice", "other"];
  const sortedTypes = [...grouped.keys()].sort(
    (a, b) => (typeOrder.indexOf(a) ?? 99) - (typeOrder.indexOf(b) ?? 99),
  );

  return (
    <section className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Documents
          {docs.length ? (
            <span className="text-sm font-normal text-muted-foreground">
              ({docs.length})
            </span>
          ) : null}
        </h2>
        <LinkDocumentDialog
          itemId={itemId}
          onLinked={() => {
            void utils.inventory.documents.listForItem.invalidate({ itemId });
          }}
        />
      </div>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : docs.length ? (
        <div className="space-y-4">
          {sortedTypes.map((type) => (
            <div key={type}>
              <h3 className="text-sm font-medium text-muted-foreground mb-2">
                {DOCUMENT_TYPE_LABELS[type] ?? type}
              </h3>
              <div className="space-y-1.5">
                {grouped.get(type)?.map((doc) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0">
                        <span className="font-medium text-sm truncate block">
                          {doc.title ?? `Document #${doc.paperlessDocumentId}`}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Linked {new Date(doc.createdAt).toLocaleDateString()}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive shrink-0"
                      onClick={() => unlinkMutation.mutate({ id: doc.id })}
                      disabled={unlinkMutation.isPending}
                      title="Unlink document"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No documents linked yet.
        </p>
      )}
    </section>
  );
}

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
