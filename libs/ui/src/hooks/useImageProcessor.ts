/**
 * useImageProcessor — client-side image preprocessing for uploads.
 *
 * - HEIC/HEIF → JPEG conversion
 * - Optional compression (browser-image-compression)
 * - Dimension cap with canvas resize
 * - EXIF strip (via canvas re-encode)
 *
 * External packages (`heic2any`, `browser-image-compression`) are loaded
 * dynamically so consumers only pay for them when this hook is used.
 * If `browser-image-compression` is not installed, processing falls back
 * to raw resize + re-encode via canvas, which strips EXIF as a
 * side-effect. HEIC/HEIF inputs do not have a canvas fallback: they
 * require `heic2any`, and processing throws when that package is missing.
 */
import { useCallback } from 'react';

export interface ImageProcessorOptions {
  /** Max width/height in pixels. Default 1920. */
  maxDimension?: number;
  /** Target max size in MB when compression is available. Default 1. */
  maxSizeMB?: number;
  /** JPEG quality (0-1) when re-encoding via canvas. Default 0.85. */
  quality?: number;
  /** Output MIME type. Default `image/jpeg`. */
  outputType?: string;
}

const HEIC_MIME = ['image/heic', 'image/heif'];

function isHeic(file: File): boolean {
  const lower = file.name.toLowerCase();
  return HEIC_MIME.includes(file.type) || lower.endsWith('.heic') || lower.endsWith('.heif');
}

async function dynamicImport<T>(name: string): Promise<T | null> {
  try {
    return (await import(/* @vite-ignore */ name)) as T;
  } catch {
    return null;
  }
}

async function convertHeicToJpeg(file: File, quality: number): Promise<Blob> {
  const mod = await dynamicImport<{ default: (args: unknown) => Promise<Blob | Blob[]> }>(
    'heic2any'
  );
  if (!mod) {
    throw new Error(
      'HEIC conversion requires "heic2any". Install the package to enable this flow.'
    );
  }
  const result = await mod.default({ blob: file, toType: 'image/jpeg', quality });
  return Array.isArray(result) ? (result[0] as Blob) : result;
}

async function resizeAndEncode(
  blob: Blob,
  maxDimension: number,
  quality: number,
  outputType: string
): Promise<Blob> {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Could not load image'));
      image.src = url;
    });
    const { width, height } = img;
    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetW = Math.round(width * scale);
    const targetH = Math.round(height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context unavailable');
    ctx.drawImage(img, 0, 0, targetW, targetH);
    const result = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, outputType, quality)
    );
    if (!result) throw new Error('Canvas encode failed');
    return result;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function compressIfAvailable(
  blob: Blob,
  name: string,
  opts: { maxSizeMB: number; maxWidthOrHeight: number; quality: number; outputType: string }
): Promise<Blob> {
  const mod = await dynamicImport<{
    default: (file: File, options: Record<string, unknown>) => Promise<Blob>;
  }>('browser-image-compression');
  if (!mod) return blob;
  const file = blob instanceof File ? blob : new File([blob], name, { type: opts.outputType });
  return mod.default(file, {
    maxSizeMB: opts.maxSizeMB,
    maxWidthOrHeight: opts.maxWidthOrHeight,
    initialQuality: opts.quality,
    fileType: opts.outputType,
    useWebWorker: true,
  });
}

export interface ProcessedImage {
  file: File;
  originalSize: number;
  processedSize: number;
}

export function useImageProcessor(options: ImageProcessorOptions = {}) {
  const { maxDimension = 1920, maxSizeMB = 1, quality = 0.85, outputType = 'image/jpeg' } = options;

  const processFile = useCallback(
    async (file: File): Promise<ProcessedImage> => {
      const originalSize = file.size;
      let working: Blob = file;
      let name = file.name;

      if (isHeic(file)) {
        working = await convertHeicToJpeg(file, quality);
        name = name.replace(/\.(heic|heif)$/i, '.jpg');
      }

      working = await resizeAndEncode(working, maxDimension, quality, outputType);
      working = await compressIfAvailable(working, name, {
        maxSizeMB,
        maxWidthOrHeight: maxDimension,
        quality,
        outputType,
      });

      const processed = new File([working], name, { type: outputType });
      return { file: processed, originalSize, processedSize: processed.size };
    },
    [maxDimension, maxSizeMB, quality, outputType]
  );

  const processFiles = useCallback(
    async (files: File[]): Promise<ProcessedImage[]> => {
      const out: ProcessedImage[] = [];
      for (const f of files) out.push(await processFile(f));
      return out;
    },
    [processFile]
  );

  return { processFile, processFiles };
}
