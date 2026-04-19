import { Camera } from 'lucide-react';

import { trpc } from '@pops/api-client';
import { Skeleton } from '@pops/ui';
import { toast } from 'sonner';

import { PhotoGallery } from '../../../components/PhotoGallery';
import { SortablePhotoGrid } from '../../../components/SortablePhotoGrid';

const BASE_URL = '/api/inventory/photos';

interface PhotoGallerySectionProps {
  itemId: string;
}

export function PhotoGallerySection({ itemId }: PhotoGallerySectionProps) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.inventory.photos.listForItem.useQuery({ itemId });

  const reorderMutation = trpc.inventory.photos.reorder.useMutation({
    onSuccess: () => void utils.inventory.photos.listForItem.invalidate({ itemId }),
    onError: (err) => toast.error(`Failed to reorder photos: ${err.message}`),
  });

  const photos = data?.data ?? [];

  if (isLoading) {
    return (
      <section className="mb-8">
        <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Camera className="h-5 w-5" />
          Photos
        </h2>
        <Skeleton className="h-48 w-full rounded-lg" />
      </section>
    );
  }

  return (
    <section className="mb-8">
      <h2 className="text-lg font-semibold flex items-center gap-2 mb-4">
        <Camera className="h-5 w-5" />
        Photos
        {photos.length > 0 && <span className="text-sm font-normal text-muted-foreground">({photos.length})</span>}
      </h2>

      <PhotoGallery photos={photos} baseUrl={BASE_URL} />

      {photos.length > 1 && (
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">Drag to reorder</p>
          <SortablePhotoGrid
            photos={photos}
            baseUrl={BASE_URL}
            isReordering={reorderMutation.isPending}
            onReorder={(orderedIds) => reorderMutation.mutate({ itemId, orderedIds })}
          />
        </div>
      )}
    </section>
  );
}
