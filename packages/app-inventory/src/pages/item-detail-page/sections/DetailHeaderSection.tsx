import { ChevronRight, ExternalLink, MapPin, Store } from 'lucide-react';
import Markdown from 'react-markdown';
import { Link } from 'react-router';
import rehypeSanitize from 'rehype-sanitize';

import { trpc } from '@pops/api-client';
import {
  Badge,
  type Condition,
  ConditionBadge,
  Skeleton,
  TypeBadge,
  WarrantyBadge,
} from '@pops/ui';

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-1">{label}</dt>
      <dd className="font-semibold text-foreground">{value}</dd>
    </div>
  );
}

function LocationBreadcrumb({ locationId }: { locationId: string | null }) {
  const { data: pathData } = trpc.inventory.locations.getPath.useQuery(
    { id: locationId! },
    { enabled: !!locationId }
  );

  return (
    <div className="mb-8 flex items-center gap-1.5 text-sm" data-testid="location-breadcrumb">
      <MapPin className="h-4 w-4 text-muted-foreground shrink-0" />
      {!locationId ? (
        <span className="text-muted-foreground">No location assigned</span>
      ) : pathData?.data ? (
        pathData.data.map((loc, i) => (
          <span key={loc.id} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3 w-3 text-muted-foreground" />}
            <Link to={`/inventory?location=${loc.id}`} className="text-app-accent hover:text-app-accent/80 hover:underline font-medium">
              {loc.name}
            </Link>
          </span>
        ))
      ) : (
        <Skeleton className="h-4 w-32" />
      )}
    </div>
  );
}

function PurchaseLinkSection({
  purchaseTransactionId, purchasedFromId, purchasedFromName,
}: {
  purchaseTransactionId: string | null;
  purchasedFromId: string | null;
  purchasedFromName: string | null;
}) {
  if (!purchaseTransactionId && !purchasedFromId) return null;
  return (
    <div className="mb-8 flex items-center gap-4 text-sm" data-testid="purchase-link-section">
      {purchaseTransactionId && (
        <Link to={`/finance/transactions/${purchaseTransactionId}`} className="flex items-center gap-1.5 text-app-accent hover:text-app-accent/80 hover:underline font-medium">
          <ExternalLink className="h-4 w-4" />
          View transaction
        </Link>
      )}
      {purchasedFromId && purchasedFromName && (
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Store className="h-4 w-4" />
          {purchasedFromName}
        </span>
      )}
    </div>
  );
}

interface DetailHeaderSectionProps {
  item: {
    itemName: string;
    brand?: string | null;
    model?: string | null;
    type?: string | null;
    condition?: string | null;
    warrantyExpires?: string | null;
    room?: string | null;
    assetId?: string | null;
    inUse: boolean;
    purchaseDate?: string | null;
    replacementValue?: number | null;
    locationId?: string | null;
    purchaseTransactionId?: string | null;
    purchasedFromId?: string | null;
    purchasedFromName?: string | null;
    notes?: string | null;
  };
}

export function DetailHeaderSection({ item }: DetailHeaderSectionProps) {
  return (
    <>
      <div className="bg-card border-2 border-app-accent/10 rounded-2xl overflow-hidden mb-8 shadow-sm shadow-app-accent/5">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 p-6">
          {item.type && <DetailField label="Type" value={<TypeBadge type={item.type} />} />}
          {item.condition && <DetailField label="Condition" value={<ConditionBadge condition={item.condition as Condition} />} />}
          <DetailField label="Warranty" value={<WarrantyBadge warrantyExpiry={item.warrantyExpires ?? null} />} />
          {item.room && <DetailField label="Room" value={item.room} />}
          {item.assetId && (
            <DetailField label="Asset ID" value={<Badge variant="outline" className="font-mono bg-muted/50">{item.assetId}</Badge>} />
          )}
          <DetailField
            label="Status"
            value={
              item.inUse ? (
                <Badge className="bg-app-accent/10 text-app-accent border-app-accent/20 hover:bg-app-accent/15">In Use</Badge>
              ) : (
                <Badge variant="secondary">Stored</Badge>
              )
            }
          />
          {item.purchaseDate && (
            <DetailField label="Purchased" value={new Date(item.purchaseDate).toLocaleDateString('en-AU', { year: 'numeric', month: 'short' })} />
          )}
          {item.replacementValue !== null && item.replacementValue !== undefined && (
            <DetailField label="Replacement" value={<span className="text-app-accent font-bold">{`$${item.replacementValue.toLocaleString()}`}</span>} />
          )}
        </div>
      </div>

      <LocationBreadcrumb locationId={item.locationId ?? null} />

      <PurchaseLinkSection
        purchaseTransactionId={item.purchaseTransactionId ?? null}
        purchasedFromId={item.purchasedFromId ?? null}
        purchasedFromName={item.purchasedFromName ?? null}
      />

      {item.notes && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-2">Notes</h2>
          <div className="text-muted-foreground prose prose-sm dark:prose-invert max-w-none">
            <Markdown rehypePlugins={[rehypeSanitize]}>{item.notes}</Markdown>
          </div>
        </div>
      )}
    </>
  );
}
