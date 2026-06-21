import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PhotoGallery } from './PhotoGallery';

import type { PhotoItem } from './PhotoGallery';

const threePhotos: PhotoItem[] = [
  { id: 1, filePath: 'item-1/front.jpg', caption: 'Front view', sortOrder: 0 },
  { id: 2, filePath: 'item-1/back.jpg', caption: 'Back view', sortOrder: 1 },
  { id: 3, filePath: 'item-1/side.jpg', caption: null, sortOrder: 2 },
];

const singlePhoto: PhotoItem[] = [
  { id: 1, filePath: 'only.jpg', caption: 'Only photo', sortOrder: 0 },
];

describe('PhotoGallery', () => {
  // --- Placeholder ---

  it('renders placeholder when no photos', () => {
    render(<PhotoGallery photos={[]} />);
    expect(screen.getByTestId('photo-placeholder')).toBeInTheDocument();
    expect(screen.getByText('No photos yet')).toBeInTheDocument();
  });

  // --- Primary display ---

  it('renders primary photo display', () => {
    render(<PhotoGallery photos={threePhotos} />);
    const primary = screen.getByTestId('primary-photo');
    expect(primary).toBeInTheDocument();
    expect(primary.querySelector('img')).toHaveAttribute('alt', 'Front view');
  });

  it('displays caption below primary photo', () => {
    render(<PhotoGallery photos={threePhotos} />);
    // Caption text visible outside lightbox
    expect(screen.getByText('Front view')).toBeInTheDocument();
  });

  it('renders photos sorted by sortOrder', () => {
    const unordered: PhotoItem[] = [
      { id: 3, filePath: 'c.jpg', caption: 'Third', sortOrder: 2 },
      { id: 1, filePath: 'a.jpg', caption: 'First', sortOrder: 0 },
    ];
    render(<PhotoGallery photos={unordered} />);
    // Primary should show "First" (sortOrder 0)
    const primary = screen.getByTestId('primary-photo');
    expect(primary.querySelector('img')).toHaveAttribute('alt', 'First');
  });

  // --- Thumbnail strip ---

  it('renders thumbnail strip for multiple photos', () => {
    render(<PhotoGallery photos={threePhotos} />);
    expect(screen.getByTestId('thumbnail-strip')).toBeInTheDocument();
    expect(screen.getByTestId('thumbnail-0')).toBeInTheDocument();
    expect(screen.getByTestId('thumbnail-1')).toBeInTheDocument();
    expect(screen.getByTestId('thumbnail-2')).toBeInTheDocument();
  });

  it('does not render thumbnail strip for single photo', () => {
    render(<PhotoGallery photos={singlePhoto} />);
    expect(screen.getByTestId('primary-photo')).toBeInTheDocument();
    expect(screen.queryByTestId('thumbnail-strip')).not.toBeInTheDocument();
  });

  // --- Thumbnail click swap ---

  it('swaps primary photo when thumbnail is clicked', () => {
    render(<PhotoGallery photos={threePhotos} />);
    const primary = screen.getByTestId('primary-photo');
    expect(primary.querySelector('img')).toHaveAttribute('alt', 'Front view');

    fireEvent.click(screen.getByTestId('thumbnail-1'));
    expect(primary.querySelector('img')).toHaveAttribute('alt', 'Back view');
  });

  // --- Active thumbnail indicator ---

  it('highlights active thumbnail with ring', () => {
    render(<PhotoGallery photos={threePhotos} />);
    const thumb0 = screen.getByTestId('thumbnail-0');
    const thumb1 = screen.getByTestId('thumbnail-1');

    expect(thumb0.className).toContain('ring-app-accent');
    expect(thumb1.className).not.toContain('ring-app-accent');

    fireEvent.click(thumb1);
    expect(thumb1.className).toContain('ring-app-accent');
    expect(thumb0.className).not.toContain('ring-app-accent');
  });

  // --- Lightbox open/close ---

  it('opens lightbox when primary photo is clicked', () => {
    render(<PhotoGallery photos={threePhotos} />);
    fireEvent.click(screen.getByTestId('primary-photo'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('closes lightbox with close button', () => {
    render(<PhotoGallery photos={threePhotos} />);
    fireEvent.click(screen.getByTestId('primary-photo'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Close lightbox'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes lightbox with Escape key', () => {
    render(<PhotoGallery photos={threePhotos} />);
    fireEvent.click(screen.getByTestId('primary-photo'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes lightbox by clicking overlay', () => {
    render(<PhotoGallery photos={threePhotos} />);
    fireEvent.click(screen.getByTestId('primary-photo'));
    const dialog = screen.getByRole('dialog');

    fireEvent.click(dialog);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // --- Lightbox navigation ---

  it('navigates to next photo in lightbox', () => {
    render(<PhotoGallery photos={threePhotos} />);
    fireEvent.click(screen.getByTestId('primary-photo'));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Next photo'));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('navigates to previous photo in lightbox', () => {
    render(<PhotoGallery photos={threePhotos} />);
    // Click second thumbnail then open lightbox
    fireEvent.click(screen.getByTestId('thumbnail-1'));
    fireEvent.click(screen.getByTestId('primary-photo'));
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Previous photo'));
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('navigates with arrow keys in lightbox', () => {
    render(<PhotoGallery photos={threePhotos} />);
    fireEvent.click(screen.getByTestId('primary-photo'));

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(screen.getByText('2 / 3')).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(screen.getByText('1 / 3')).toBeInTheDocument();
  });

  it('does not show nav arrows for single photo lightbox', () => {
    render(<PhotoGallery photos={singlePhoto} />);
    fireEvent.click(screen.getByTestId('primary-photo'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.queryByLabelText('Next photo')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Previous photo')).not.toBeInTheDocument();
  });

  // --- Delete ---

  it('shows delete button when onDelete is provided', () => {
    render(<PhotoGallery photos={threePhotos} onDelete={vi.fn()} />);
    const deleteButtons = screen.getAllByLabelText(/Delete photo/);
    expect(deleteButtons).toHaveLength(3);
  });

  it('calls onDelete with photo id', () => {
    const onDelete = vi.fn();
    render(<PhotoGallery photos={threePhotos} onDelete={onDelete} />);
    fireEvent.click(screen.getByLabelText('Delete photo Front view'));
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('does not show delete buttons when onDelete is not provided', () => {
    render(<PhotoGallery photos={threePhotos} />);
    expect(screen.queryByLabelText(/Delete photo/)).not.toBeInTheDocument();
  });

  // --- Misc ---

  it('uses custom baseUrl', () => {
    render(<PhotoGallery photos={singlePhoto} baseUrl="/custom" />);
    const primary = screen.getByTestId('primary-photo');
    expect(primary.querySelector('img')?.getAttribute('src')).toContain('/custom/');
  });

  it('displays caption in lightbox', () => {
    render(<PhotoGallery photos={threePhotos} />);
    fireEvent.click(screen.getByTestId('primary-photo'));
    // Caption "Front view" should appear in lightbox (it also appears below primary,
    // but lightbox should have it too)
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveTextContent('Front view');
  });
});
