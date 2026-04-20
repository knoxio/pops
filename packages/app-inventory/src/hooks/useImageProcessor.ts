/**
 * useImageProcessor — Client-side image compression and HEIC/HEIF conversion.
 *
 * Processes selected files before upload: converts HEIC/HEIF to JPEG,
 * compresses images to fit within a 1920x1920 bounding box, and strips EXIF.
 */
import imageCompression from 'browser-image-compression';
import { useCallback, useState } from 'react';

const MAX_DIMENSION = 1920;
const QUALITY = 0.8;

const HEIC_TYPES = new Set(['image/heic', 'image/heif']);

function isHeic(file: File): boolean {
  if (HEIC_TYPES.has(file.type)) return true;
  const ext = file.name.toLowerCase();
  return ext.endsWith('.heic') || ext.endsWith('.heif');
}

export interface ProcessedFile {
  original: File;
  processed: Blob;
  previewUrl: string;
  originalSize: number;
  processedSize: number;
}

async function convertHeicToJpeg(file: File): Promise<File> {
  const heic2any = (await import('heic2any')).default;
  const blob = await heic2any({ blob: file, toType: 'image/jpeg', quality: QUALITY });
  const converted: Blob | undefined = Array.isArray(blob) ? blob[0] : blob;
  if (!converted) {
    throw new Error(`HEIC conversion failed for ${file.name}: empty result`);
  }
  const newName = file.name.replace(/\.heic$/i, '.jpg').replace(/\.heif$/i, '.jpg');
  return new File([converted], newName, { type: 'image/jpeg' });
}

async function processSingle(file: File): Promise<ProcessedFile> {
  const input = isHeic(file) ? await convertHeicToJpeg(file) : file;
  const compressed = await imageCompression(input, {
    maxWidthOrHeight: MAX_DIMENSION,
    initialQuality: QUALITY,
    useWebWorker: true,
    exifOrientation: undefined,
  });
  return {
    original: file,
    processed: compressed,
    previewUrl: URL.createObjectURL(compressed),
    originalSize: file.size,
    processedSize: compressed.size,
  };
}

export function useImageProcessor() {
  const [processing, setProcessing] = useState(false);

  const processFiles = useCallback(async (files: File[]): Promise<ProcessedFile[]> => {
    setProcessing(true);
    try {
      const results: ProcessedFile[] = [];
      for (const file of files) {
        results.push(await processSingle(file));
      }
      return results;
    } finally {
      setProcessing(false);
    }
  }, []);

  return { processFiles, processing };
}
