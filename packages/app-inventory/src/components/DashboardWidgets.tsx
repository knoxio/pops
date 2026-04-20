import { Clock, Shield } from 'lucide-react';
import { useNavigate } from 'react-router';

import { trpc } from '@pops/api-client';
import {
  Card,
  CardContent,
  formatAUD,
  formatRelativeTime,
  Skeleton,
  StatCard,
  TypeBadge,
} from '@pops/ui';

import { ValueByLocationCard, ValueByTypeCard } from './ValueBreakdown';

function DashboardSkeleton() {
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
      <Card className="col-span-full">
        <CardContent className="p-4 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}

interface RecentItem {
  id: string;
  itemName: string;
  type: string | null;
  assetId: string | null;
  lastEditedTime: string;
}

function RecentItemRow({ item, onOpen }: { item: RecentItem; onOpen: (id: string) => void }) {
  return (
    <li
      role="button"
      tabIndex={0}
      className="flex items-center gap-2 text-sm rounded-md px-2 py-1.5 -mx-2 cursor-pointer hover:bg-muted/50 transition-colors"
      onClick={() => onOpen(item.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(item.id);
        }
      }}
    >
      <span className="font-medium truncate">{item.itemName}</span>
      {item.type && <TypeBadge type={item.type} />}
      {item.assetId && (
        <span className="text-xs text-muted-foreground shrink-0">{item.assetId}</span>
      )}
      <span className="text-xs text-muted-foreground shrink-0 ml-auto">
        {formatRelativeTime(item.lastEditedTime)}
      </span>
    </li>
  );
}

function RecentlyAddedCard({
  items,
  onOpen,
}: {
  items: RecentItem[];
  onOpen: (id: string) => void;
}) {
  return (
    <Card className="col-span-full">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground mb-3">
          <Clock className="h-4 w-4" />
          <span className="text-xs font-medium">Recently Added</span>
        </div>
        {items.length > 0 ? (
          <ul className="space-y-1.5">
            {items.map((item) => (
              <RecentItemRow key={item.id} item={item} onOpen={onOpen} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No items yet</p>
        )}
      </CardContent>
    </Card>
  );
}

export function DashboardWidgets() {
  const navigate = useNavigate();
  const { data, isLoading } = trpc.inventory.reports.dashboard.useQuery();

  if (isLoading) return <DashboardSkeleton />;
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
      <StatCard title="Items" value={itemCount} color="slate" />
      <StatCard title="Replacement" value={formatAUD(totalReplacementValue)} color="sky" />
      <StatCard title="Resale" value={formatAUD(totalResaleValue)} color="violet" />
      <StatCard
        title="Warranties"
        value={warrantiesExpiringSoon}
        color={warrantiesExpiringSoon > 0 ? 'amber' : 'slate'}
        description={
          <span className="flex items-center gap-1">
            <Shield className="h-3 w-3" />
            expiring
          </span>
        }
        onClick={() => navigate('/inventory/warranties')}
      />
      <RecentlyAddedCard
        items={recentlyAdded}
        onOpen={(id) => navigate(`/inventory/items/${id}`)}
      />
      <ValueByLocationCard className="col-span-full" />
      <ValueByTypeCard className="col-span-full" />
    </div>
  );
}
