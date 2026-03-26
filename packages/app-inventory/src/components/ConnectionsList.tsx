/**
 * ConnectionsList — displays linked inventory items for a given item.
 * Shows connection count header, list of connected items with badges,
 * and a "Connect to…" button placeholder.
 */
import { cn, AssetIdBadge, TypeBadge } from "@pops/ui";
import { Link2, Plus } from "lucide-react";

export interface ConnectedItem {
  id: string;
  itemName: string;
  assetId?: string | null;
  type?: string | null;
}

export interface ConnectionsListProps {
  connections: ConnectedItem[];
  onItemClick?: (id: string) => void;
  onConnect?: () => void;
  className?: string;
}

export function ConnectionsList({
  connections,
  onItemClick,
  onConnect,
  className,
}: ConnectionsListProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Link2 className="h-4 w-4 text-muted-foreground" />
          Connections
          <span className="text-xs font-normal text-muted-foreground">({connections.length})</span>
        </h4>
      </div>

      {/* List */}
      {connections.length === 0 ? (
        <p className="py-3 text-center text-sm text-muted-foreground">No connected items</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border">
          {connections.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                  "transition-colors hover:bg-accent/50",
                  onItemClick && "cursor-pointer"
                )}
                onClick={() => onItemClick?.(item.id)}
                disabled={!onItemClick}
              >
                <span className="flex-1 truncate font-medium">{item.itemName}</span>
                <div className="flex shrink-0 items-center gap-1">
                  {item.assetId && <AssetIdBadge assetId={item.assetId} />}
                  {item.type && <TypeBadge type={item.type} />}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Connect button */}
      {onConnect && (
        <button
          type="button"
          className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground"
          onClick={onConnect}
        >
          <Plus className="h-3.5 w-3.5" />
          Connect to item…
        </button>
      )}
    </div>
  );
}

ConnectionsList.displayName = "ConnectionsList";
