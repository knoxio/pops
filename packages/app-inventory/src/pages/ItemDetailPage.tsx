import { Link } from 'react-router';

import { Alert, AlertDescription, AlertTitle, PageHeader, Skeleton } from '@pops/ui';

import { ConnectionsSection } from './item-detail-page/sections/ConnectionsSection';
import { DetailHeaderSection } from './item-detail-page/sections/DetailHeaderSection';
import { DocumentsSection } from './item-detail-page/sections/DocumentsSection';
import { HeaderActions } from './item-detail-page/sections/HeaderActions';
import { PhotoGallerySection } from './item-detail-page/sections/PhotoGallerySection';
import { useItemDetailPageModel } from './item-detail-page/useItemDetailPageModel';

function ItemDetailSkeleton() {
  return (
    <div className="space-y-6 max-w-3xl">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-6 w-32" />
      <div className="grid grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20" />
        ))}
      </div>
    </div>
  );
}

function ErrorState({
  error,
}: {
  error: { data?: { code?: string | undefined } | null; message: string };
}) {
  const is404 = error.data?.code === 'NOT_FOUND';
  return (
    <div>
      <Alert variant="destructive">
        <AlertTitle>{is404 ? 'Item not found' : 'Error'}</AlertTitle>
        <AlertDescription>{is404 ? "This item doesn't exist." : error.message}</AlertDescription>
      </Alert>
      <Link
        to="/inventory"
        className="mt-4 inline-block text-sm text-app-accent hover:text-app-accent/80 underline font-medium"
      >
        Back to inventory
      </Link>
    </div>
  );
}

function ItemTitle({
  itemName,
  brand,
  model,
}: {
  itemName: string;
  brand?: string | null;
  model?: string | null;
}) {
  return (
    <div>
      <span className="text-2xl md:text-3xl font-extrabold tracking-tight">{itemName}</span>
      {(brand || model) && (
        <p className="text-muted-foreground font-medium uppercase text-xs tracking-widest opacity-80 mt-1">
          {[brand, model].filter(Boolean).join(' • ')}
        </p>
      )}
    </div>
  );
}

type Model = ReturnType<typeof useItemDetailPageModel>;
type Item = NonNullable<Model['itemData']>['data'];

function DetailContent({ model, id, item }: { model: Model; id: string; item: Item }) {
  const {
    locationPath,
    connectionsData,
    connectionsLoading,
    photosData,
    photosLoading,
    reorderPhotosMutation,
    deleteMutation,
    disconnectMutation,
    utils,
  } = model;
  const connectionsCount = connectionsData?.data.length ?? 0;
  const photosCount = photosData?.pagination?.total ?? 0;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={<ItemTitle itemName={item.itemName} brand={item.brand} model={item.model} />}
        backHref="/inventory"
        breadcrumbs={[{ label: 'Inventory', href: '/inventory' }, { label: item.itemName }]}
        actions={
          <HeaderActions
            id={id}
            itemName={item.itemName}
            connectionsCount={connectionsCount}
            photosCount={photosCount}
            onDelete={() => deleteMutation.mutate({ id })}
          />
        }
        renderLink={Link}
        className="mb-8"
      />
      <DetailHeaderSection item={item} locationPath={locationPath} />
      <PhotoGallerySection
        photos={photosData?.data ?? []}
        isLoading={photosLoading}
        isReordering={reorderPhotosMutation.isPending}
        onReorder={(orderedIds) => reorderPhotosMutation.mutate({ itemId: id, orderedIds })}
      />
      <ConnectionsSection
        itemId={id}
        connections={connectionsData?.data ?? []}
        connectionsLoading={connectionsLoading}
        isDisconnecting={disconnectMutation.isPending}
        onConnected={() => void utils.inventory.connections.listForItem.invalidate({ itemId: id })}
        onDisconnect={(conn) =>
          disconnectMutation.mutate({ itemAId: conn.itemAId, itemBId: conn.itemBId })
        }
      />
      <DocumentsSection itemId={id} />
    </div>
  );
}

export function ItemDetailPage() {
  const model = useItemDetailPageModel();
  if (model.isLoading) return <ItemDetailSkeleton />;
  if (model.error) return <ErrorState error={model.error} />;
  if (!model.itemData || !model.id) return null;
  return <DetailContent model={model} id={model.id} item={model.itemData.data} />;
}
