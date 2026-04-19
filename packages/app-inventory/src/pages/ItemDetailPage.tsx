import { Pencil, Trash2 } from 'lucide-react';
import { Link } from 'react-router';

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertTitle,
  Button,
  PageHeader,
  Skeleton,
} from '@pops/ui';

import { ConnectionsSection } from './item-detail-page/sections/ConnectionsSection';
import { DetailHeaderSection } from './item-detail-page/sections/DetailHeaderSection';
import { DocumentsSection } from './item-detail-page/sections/DocumentsSection';
import { PhotoGallerySection } from './item-detail-page/sections/PhotoGallerySection';
import { useItemDetailPageModel } from './item-detail-page/useItemDetailPageModel';

export function ItemDetailPage() {
  const {
    id,
    itemData,
    isLoading,
    error,
    locationPath,
    connectionsData,
    connectionsLoading,
    photosData,
    photosLoading,
    reorderPhotosMutation,
    deleteMutation,
    disconnectMutation,
    utils,
  } = useItemDetailPageModel();

  if (isLoading) {
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

  if (error) {
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

  if (!itemData || !id) return null;
  const item = itemData.data;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title={
          <div>
            <span className="text-2xl md:text-3xl font-extrabold tracking-tight">
              {item.itemName}
            </span>
            {(item.brand || item.model) && (
              <p className="text-muted-foreground font-medium uppercase text-xs tracking-widest opacity-80 mt-1">
                {[item.brand, item.model].filter(Boolean).join(' • ')}
              </p>
            )}
          </div>
        }
        backHref="/inventory"
        breadcrumbs={[{ label: 'Inventory', href: '/inventory' }, { label: item.itemName }]}
        actions={
          <div className="flex items-center gap-2">
            <Link to={`/inventory/items/${id}/edit`}>
              <Button
                variant="outline"
                size="sm"
                className="font-bold border-app-accent/20 hover:border-app-accent/50 hover:bg-app-accent/5 transition-colors"
              >
                <Pencil className="h-4 w-4 mr-2 text-app-accent" />
                Edit
              </Button>
            </Link>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="ghost" size="sm" className="text-destructive">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete {item.itemName}?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will also remove {connectionsData?.data.length ?? 0} connection
                    {(connectionsData?.data.length ?? 0) !== 1 ? 's' : ''} and{' '}
                    {photosData?.pagination?.total ?? 0} photo
                    {(photosData?.pagination?.total ?? 0) !== 1 ? 's' : ''}.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => deleteMutation.mutate({ id })}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
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
