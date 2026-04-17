import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SortablePhotoGrid } from './SortablePhotoGrid';

import type { PhotoItem } from './PhotoGallery';

const photos: PhotoItem[] = [
  { id: 1, filePath: 'item-1/photo-a.jpg', caption: 'Front view', sortOrder: 0 },
  { id: 2, filePath: 'item-1/photo-b.jpg', caption: 'Back view', sortOrder: 1 },
  { id: 3, filePath: 'item-1/photo-c.jpg', caption: null, sortOrder: 2 },
];

describe('SortablePhotoGrid', () => {
  it('renders all photos as draggable items', () => {
    render(<SortablePhotoGrid photos={photos} onReorder={vi.fn()} />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(3);
    items.forEach((item) => {
      expect(item).toHaveAttribute('draggable', 'true');
    });
  });

  it('marks first photo as Primary', () => {
    render(<SortablePhotoGrid photos={photos} onReorder={vi.fn()} />);
    expect(screen.getByText('Primary')).toBeInTheDocument();
  });

  it('renders photos sorted by sortOrder', () => {
    const unordered: PhotoItem[] = [
      { id: 3, filePath: 'c.jpg', caption: 'Third', sortOrder: 2 },
      { id: 1, filePath: 'a.jpg', caption: 'First', sortOrder: 0 },
      { id: 2, filePath: 'b.jpg', caption: 'Second', sortOrder: 1 },
    ];
    render(<SortablePhotoGrid photos={unordered} onReorder={vi.fn()} />);
    const items = screen.getAllByRole('listitem');
    expect(items[0]).toHaveAttribute('aria-label', 'Photo 1: First');
    expect(items[1]).toHaveAttribute('aria-label', 'Photo 2: Second');
    expect(items[2]).toHaveAttribute('aria-label', 'Photo 3: Third');
  });

  it('does not render when only one photo', () => {
    const { container } = render(<SortablePhotoGrid photos={[photos[0]!]} onReorder={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('does not render when no photos', () => {
    const { container } = render(<SortablePhotoGrid photos={[]} onReorder={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('calls onReorder when an item is dropped on a new position', () => {
    const onReorder = vi.fn();
    render(<SortablePhotoGrid photos={photos} onReorder={onReorder} />);
    const items = screen.getAllByRole('listitem');

    // Drag item 0 to position 2
    fireEvent.dragStart(items[0]!);
    fireEvent.dragOver(items[2]!, { preventDefault: vi.fn() });
    fireEvent.drop(items[2]!, { preventDefault: vi.fn() });

    expect(onReorder).toHaveBeenCalledWith([2, 3, 1]);
  });

  it('does not call onReorder when dropped on same position', () => {
    const onReorder = vi.fn();
    render(<SortablePhotoGrid photos={photos} onReorder={onReorder} />);
    const items = screen.getAllByRole('listitem');

    fireEvent.dragStart(items[1]!);
    fireEvent.dragOver(items[1]!, { preventDefault: vi.fn() });
    fireEvent.drop(items[1]!, { preventDefault: vi.fn() });

    expect(onReorder).not.toHaveBeenCalled();
  });

  it('applies disabled styles when isReordering is true', () => {
    render(<SortablePhotoGrid photos={photos} onReorder={vi.fn()} isReordering />);
    const items = screen.getAllByRole('listitem');
    items.forEach((item) => {
      expect(item.className).toContain('pointer-events-none');
    });
  });

  it('uses custom baseUrl for image sources', () => {
    render(<SortablePhotoGrid photos={photos} onReorder={vi.fn()} baseUrl="/custom/url" />);
    const imgs = screen.getAllByRole('img');
    expect(imgs[0]).toHaveAttribute('src', '/custom/url/item-1%2Fphoto-a.jpg');
  });

  it('clears drag state on dragEnd', () => {
    const onReorder = vi.fn();
    render(<SortablePhotoGrid photos={photos} onReorder={onReorder} />);
    const items = screen.getAllByRole('listitem');

    fireEvent.dragStart(items[0]!);
    expect(items[0]!.className).toContain('opacity-40');

    fireEvent.dragEnd(items[0]!);
    expect(items[0]!.className).not.toContain('opacity-40');
  });
});
