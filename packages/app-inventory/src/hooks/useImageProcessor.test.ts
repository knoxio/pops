import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useImageProcessor } from './useImageProcessor';

// Mock browser-image-compression
vi.mock('browser-image-compression', () => ({
  default: vi.fn(async (file: File) => {
    // Return a smaller blob to simulate compression
    const compressed = new Blob([new Uint8Array(100)], { type: file.type || 'image/jpeg' });
    return compressed;
  }),
}));

// Mock heic2any
vi.mock('heic2any', () => ({
  default: vi.fn(async () => {
    return new Blob([new Uint8Array(200)], { type: 'image/jpeg' });
  }),
}));

// Mock URL.createObjectURL
const mockCreateObjectURL = vi.fn(() => 'blob:http://localhost/mock-preview');
globalThis.URL.createObjectURL = mockCreateObjectURL;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('useImageProcessor', () => {
  it('starts with processing = false', () => {
    const { result } = renderHook(() => useImageProcessor());
    expect(result.current.processing).toBe(false);
  });

  it('processes JPEG files — compresses and returns processed result', async () => {
    const { result } = renderHook(() => useImageProcessor());

    const file = new File([new Uint8Array(5000)], 'photo.jpg', { type: 'image/jpeg' });
    let processed: Awaited<ReturnType<typeof result.current.processFiles>> = [];

    await act(async () => {
      processed = await result.current.processFiles([file]);
    });

    expect(processed).toHaveLength(1);
    expect(processed[0]!.original).toBe(file);
    expect(processed[0]!.processedSize).toBe(100);
    expect(processed[0]!.originalSize).toBe(5000);
    expect(processed[0]!.previewUrl).toBe('blob:http://localhost/mock-preview');
  });

  it('detects HEIC files by extension and converts to JPEG', async () => {
    const heic2any = (await import('heic2any')).default as unknown as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useImageProcessor());

    // File with empty type but .heic extension
    const file = new File([new Uint8Array(1000)], 'photo.heic', { type: '' });

    await act(async () => {
      await result.current.processFiles([file]);
    });

    expect(heic2any).toHaveBeenCalledWith(
      expect.objectContaining({ blob: file, toType: 'image/jpeg' })
    );
  });

  it('detects HEIC files by MIME type', async () => {
    const heic2any = (await import('heic2any')).default as unknown as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useImageProcessor());

    const file = new File([new Uint8Array(1000)], 'photo.xyz', { type: 'image/heic' });

    await act(async () => {
      await result.current.processFiles([file]);
    });

    expect(heic2any).toHaveBeenCalled();
  });

  it('does not call heic2any for non-HEIC files', async () => {
    const heic2any = (await import('heic2any')).default as unknown as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useImageProcessor());

    const file = new File([new Uint8Array(1000)], 'photo.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.processFiles([file]);
    });

    expect(heic2any).not.toHaveBeenCalled();
  });

  it('processes multiple files in batch', async () => {
    const { result } = renderHook(() => useImageProcessor());

    const files = [
      new File([new Uint8Array(1000)], 'a.jpg', { type: 'image/jpeg' }),
      new File([new Uint8Array(2000)], 'b.png', { type: 'image/png' }),
      new File([new Uint8Array(3000)], 'c.webp', { type: 'image/webp' }),
    ];

    let processed: Awaited<ReturnType<typeof result.current.processFiles>> = [];
    await act(async () => {
      processed = await result.current.processFiles(files);
    });

    expect(processed).toHaveLength(3);
    expect(processed[0]!.original.name).toBe('a.jpg');
    expect(processed[1]!.original.name).toBe('b.png');
    expect(processed[2]!.original.name).toBe('c.webp');
  });

  it('calls imageCompression with correct max dimension', async () => {
    const imageCompression = (await import('browser-image-compression'))
      .default as unknown as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useImageProcessor());

    const file = new File([new Uint8Array(1000)], 'photo.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.processFiles([file]);
    });

    expect(imageCompression).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        maxWidthOrHeight: 1920,
        initialQuality: 0.8,
        useWebWorker: true,
      })
    );
  });

  it('generates preview URL for each processed file', async () => {
    const { result } = renderHook(() => useImageProcessor());

    const file = new File([new Uint8Array(1000)], 'photo.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.processFiles([file]);
    });

    expect(mockCreateObjectURL).toHaveBeenCalled();
  });

  it('sets processing to true during processing and false after', async () => {
    const { result } = renderHook(() => useImageProcessor());
    expect(result.current.processing).toBe(false);

    const file = new File([new Uint8Array(1000)], 'photo.jpg', { type: 'image/jpeg' });

    await act(async () => {
      await result.current.processFiles([file]);
    });

    expect(result.current.processing).toBe(false);
  });

  it('renames HEIC file extension to .jpg', async () => {
    const imageCompression = (await import('browser-image-compression'))
      .default as unknown as ReturnType<typeof vi.fn>;
    const { result } = renderHook(() => useImageProcessor());

    const file = new File([new Uint8Array(1000)], 'vacation.HEIC', { type: '' });

    await act(async () => {
      await result.current.processFiles([file]);
    });

    // The File passed to imageCompression should have .jpg extension
    const passedFile = imageCompression.mock.calls[0]?.[0];
    expect(passedFile?.name).toMatch(/\.jpg$/);
  });
});
