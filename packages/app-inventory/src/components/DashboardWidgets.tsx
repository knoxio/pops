import { Clock, DollarSign, Package, Shield } from 'lucide-react';
import { useNavigate } from 'react-router';

/**
 * DashboardWidgets — summary statistics for the inventory report dashboard.
 *
 * Renders four stat cards (item count, replacement value, resale value,
 * expiring warranties) plus a recently-added items list. Data is fetched
 * via a single aggregation query. PRD-051/US-01.
 */
import { Card, CardContent, Skeleton, TypeBadge } from '@pops/ui';

import { trpc } from '../lib/trpc';
import { formatCurrency } from '../lib/utils';
import { ValueByTypeCard } from './ValueBreakdown';

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

export function DashboardWidgets() {
  const navigate = useNavigate();
  const { data, isLoading } = trpc.inventory.reports.dashboard.useQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-16" />
            </CardContent>
          </Card>
        ))}
        <Card className="col-span-full">
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-6 w-full" />
            ))}
          </CardContent>
        </Card>
        <Card className="col-span-full">
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data?.data) return null;

  const {
    itemCount,
    totalReplacementValue,
    totalResaleValue,
    warrantiesExpiringSoon,
    recentlyAdded,
  } = data.data;

  return (
    <div className="grid grid-cols-2 gap-4">
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Package className="h-4 w-4" />
            <span className="text-xs font-medium">Items</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">{itemCount}</div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium">Replacement</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {formatCurrency(totalReplacementValue)}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <DollarSign className="h-4 w-4" />
            <span className="text-xs font-medium">Resale</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">{formatCurrency(totalResaleValue)}</div>
        </CardContent>
      </Card>

      <Card
        role="button"
        tabIndex={0}
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => navigate('/inventory/warranties')}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            navigate('/inventory/warranties');
          }
        }}
      >
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Shield className="h-4 w-4" />
            <span className="text-xs font-medium">Warranties</span>
          </div>
          <div className="text-2xl font-bold tabular-nums">
            {warrantiesExpiringSoon}
            <span className="text-sm font-normal text-muted-foreground ml-1">expiring</span>
          </div>
        </CardContent>
      </Card>

      <Card className="col-span-full">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 text-muted-foreground mb-3">
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium">Recently Added</span>
          </div>
          {recentlyAdded.length > 0 ? (
            <ul className="space-y-1.5">
              {recentlyAdded.map((item) => (
                <li
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => navigate(`/inventory/items/${item.id}`)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      navigate(`/inventory/items/${item.id}`);
                    }
                  }}
                >
                  <span className="font-medium truncate">{item.itemName}</span>
                  {item.type && <TypeBadge type={item.type} />}
                  {item.assetId && (
                    <span className="text-xs text-muted-foreground shrink-0">{item.assetId}</span>
                  )}
                  <span className="text-xs text-muted-foreground shrink-0 ml-auto">
                    {timeAgo(item.lastEditedTime)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No items yet</p>
          )}
        </CardContent>
      </Card>

      <ValueByTypeCard className="col-span-full" />
    </div>
  );
}
