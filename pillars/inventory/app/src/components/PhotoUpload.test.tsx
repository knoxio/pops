import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PhotoUpload, type UploadedFile } from './PhotoUpload';

describe('PhotoUpload', () => {
  const mockOnFilesSelected = vi.fn();
  const mockOnRemove = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the drop zone with upload prompt', () => {
    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} />);
    expect(screen.getByText(/click to browse/i)).toBeInTheDocument();
    expect(screen.getByText(/drag and drop/i)).toBeInTheDocument();
  });

  it('renders upload photos aria label', () => {
    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} />);
    expect(screen.getByRole('button', { name: /upload photos/i })).toBeInTheDocument();
  });

  it('renders camera button', () => {
    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} />);
    expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument();
  });

  it('shows max file size', () => {
    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} maxSizeMb={5} />);
    expect(screen.getByText(/5MB/)).toBeInTheDocument();
  });

  it('accepts files via file input change', () => {
    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} />);
    const inputs = document.querySelectorAll('input[type="file"]');
    const fileInput = inputs[0] as HTMLInputElement;

    const file = new File(['test'], 'photo.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(mockOnFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('rejects non-image files with validation error', () => {
    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} />);
    const inputs = document.querySelectorAll('input[type="file"]');
    const fileInput = inputs[0] as HTMLInputElement;

    const file = new File(['test'], 'doc.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(mockOnFilesSelected).not.toHaveBeenCalled();
    expect(screen.getByText(/not an image/i)).toBeInTheDocument();
  });

  it('rejects oversized files', () => {
    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} maxSizeMb={1} />);
    const inputs = document.querySelectorAll('input[type="file"]');
    const fileInput = inputs[0] as HTMLInputElement;

    // Create file larger than 1MB
    const bigContent = new Uint8Array(1.5 * 1024 * 1024);
    const file = new File([bigContent], 'big.jpg', { type: 'image/jpeg' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(mockOnFilesSelected).not.toHaveBeenCalled();
    expect(screen.getByText(/exceeds 1MB/i)).toBeInTheDocument();
  });

  it('allows HEIC files by extension even without image/ MIME type', () => {
    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} />);
    const inputs = document.querySelectorAll('input[type="file"]');
    const fileInput = inputs[0] as HTMLInputElement;

    const file = new File(['test'], 'photo.heic', { type: '' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    expect(mockOnFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('supports batch file selection (multiple files)', () => {
    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} />);
    const inputs = document.querySelectorAll('input[type="file"]');
    const fileInput = inputs[0] as HTMLInputElement;

    const file1 = new File(['a'], 'a.jpg', { type: 'image/jpeg' });
    const file2 = new File(['b'], 'b.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file1, file2] } });

    expect(mockOnFilesSelected).toHaveBeenCalledWith([file1, file2]);
  });

  it('renders file preview list with status', () => {
    const files: UploadedFile[] = [
      {
        localId: '1',
        file: new File(['test'], 'photo.jpg', { type: 'image/jpeg' }),
        previewUrl: 'blob:http://localhost/preview',
        status: 'pending',
      },
      {
        localId: '2',
        file: new File(['test'], 'photo2.jpg', { type: 'image/jpeg' }),
        previewUrl: 'blob:http://localhost/preview2',
        status: 'done',
      },
    ];

    render(
      <PhotoUpload onFilesSelected={mockOnFilesSelected} files={files} onRemove={mockOnRemove} />
    );

    expect(screen.getByText('photo.jpg')).toBeInTheDocument();
    expect(screen.getByText('photo2.jpg')).toBeInTheDocument();
    expect(screen.getByText('Ready')).toBeInTheDocument();
    expect(screen.getByText('Uploaded')).toBeInTheDocument();
  });

  it('renders progress bar during upload', () => {
    const files: UploadedFile[] = [
      {
        localId: '1',
        file: new File(['test'], 'uploading.jpg', { type: 'image/jpeg' }),
        previewUrl: 'blob:http://localhost/preview',
        status: 'uploading',
        progress: 50,
      },
    ];

    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} files={files} />);

    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });

  it('shows error status for failed uploads', () => {
    const files: UploadedFile[] = [
      {
        localId: '1',
        file: new File(['test'], 'fail.jpg', { type: 'image/jpeg' }),
        previewUrl: '',
        status: 'error',
        error: 'Network error',
      },
    ];

    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} files={files} />);

    expect(screen.getByText('Network error')).toBeInTheDocument();
  });

  it('shows file size info when available', () => {
    const files: UploadedFile[] = [
      {
        localId: '1',
        file: new File(['test'], 'compressed.jpg', { type: 'image/jpeg' }),
        previewUrl: 'blob:http://localhost/preview',
        status: 'pending',
        originalSize: 5 * 1024 * 1024,
        processedSize: 800 * 1024,
      },
    ];

    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} files={files} />);

    expect(screen.getByText(/5\.0 MB/)).toBeInTheDocument();
    expect(screen.getByText(/800\.0 KB/)).toBeInTheDocument();
  });

  it('calls onRemove when remove button is clicked', () => {
    const files: UploadedFile[] = [
      {
        localId: '1',
        file: new File(['test'], 'remove-me.jpg', { type: 'image/jpeg' }),
        previewUrl: '',
        status: 'pending',
      },
    ];

    render(
      <PhotoUpload onFilesSelected={mockOnFilesSelected} files={files} onRemove={mockOnRemove} />
    );

    fireEvent.click(screen.getByRole('button', { name: /remove remove-me.jpg/i }));
    expect(mockOnRemove).toHaveBeenCalledWith('1');
  });

  it('handles drag and drop', () => {
    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} />);
    const dropZone = screen.getByRole('button', { name: /upload photos/i });

    const file = new File(['test'], 'drop.jpg', { type: 'image/jpeg' });
    const dataTransfer = { files: [file] };

    fireEvent.dragOver(dropZone, { dataTransfer });
    fireEvent.drop(dropZone, { dataTransfer });

    expect(mockOnFilesSelected).toHaveBeenCalledWith([file]);
  });

  it('disables interaction when disabled prop is true', () => {
    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} disabled />);
    const dropZone = screen.getByRole('button', { name: /upload photos/i });

    const file = new File(['test'], 'disabled.jpg', { type: 'image/jpeg' });
    fireEvent.drop(dropZone, { dataTransfer: { files: [file] } });

    expect(mockOnFilesSelected).not.toHaveBeenCalled();
  });

  it('renders thumbnail previews for files with preview URLs', () => {
    const files: UploadedFile[] = [
      {
        localId: '1',
        file: new File(['test'], 'thumb.jpg', { type: 'image/jpeg' }),
        previewUrl: 'blob:http://localhost/thumb',
        status: 'done',
      },
    ];

    render(<PhotoUpload onFilesSelected={mockOnFilesSelected} files={files} />);

    const img = screen.getByAltText('thumb.jpg');
    expect(img).toHaveAttribute('src', 'blob:http://localhost/thumb');
  });
});
