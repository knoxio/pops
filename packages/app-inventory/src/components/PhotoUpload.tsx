/**
 * PhotoUpload — Drag-and-drop zone with click-to-browse for item photos.
 *
 * Handles file selection, shows upload progress per file,
 * and allows deleting individual queued/uploaded photos.
 */
import { Button, Progress } from '@pops/ui';
import { Camera, ImageIcon, Upload, X } from 'lucide-react';
import { useCallback, useRef, useState } from 'react';

import { cn } from '../lib/utils';

export interface UploadedFile {
  /** Client-side identifier for tracking */
  localId: string;
  file: File;
  /** Preview URL created via URL.createObjectURL */
  previewUrl: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  /** Upload progress 0–100 */
  progress?: number;
  /** Error message if status is "error" */
  error?: string;
  /** Original file size before compression */
  originalSize?: number;
  /** Processed file size after compression */
  processedSize?: number;
}

interface PhotoUploadProps {
  /** Called when files are selected. Parent handles the actual upload. */
  onFilesSelected: (files: File[]) => void;
  /** Currently tracked files with their upload status */
  files?: UploadedFile[];
  /** Remove a file from the queue */
  onRemove?: (localId: string) => void;
  /** Max file size in MB (default: 10) */
  maxSizeMb?: number;
  /** Accepted file types (default: image/*) */
  accept?: string;
  /** Whether uploads are currently in progress */
  disabled?: boolean;
  className?: string;
}

const DEFAULT_MAX_SIZE_MB = 10;
const DEFAULT_ACCEPT = 'image/*';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export function PhotoUpload({
  onFilesSelected,
  files = [],
  onRemove,
  maxSizeMb = DEFAULT_MAX_SIZE_MB,
  accept = DEFAULT_ACCEPT,
  disabled = false,
  className,
}: PhotoUploadProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const validateFiles = useCallback(
    (fileList: File[]): File[] => {
      const maxBytes = maxSizeMb * 1024 * 1024;
      const valid: File[] = [];
      const errors: string[] = [];

      for (const file of fileList) {
        const isImage = file.type.startsWith('image/');
        const isHeic = /\.heic$/i.test(file.name) || /\.heif$/i.test(file.name);
        if (!isImage && !isHeic) {
          errors.push(`${file.name}: not an image`);
          continue;
        }
        if (file.size > maxBytes) {
          errors.push(`${file.name}: exceeds ${maxSizeMb}MB limit`);
          continue;
        }
        valid.push(file);
      }

      if (errors.length > 0) {
        setValidationError(errors.join(', '));
      } else {
        setValidationError(null);
      }

      return valid;
    },
    [maxSizeMb]
  );

  const handleFiles = useCallback(
    (fileList: FileList | null) => {
      if (!fileList || fileList.length === 0) return;
      const valid = validateFiles(Array.from(fileList));
      if (valid.length > 0) {
        onFilesSelected(valid);
      }
    },
    [validateFiles, onFilesSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [disabled, handleFiles]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragOver(true);
    },
    [disabled]
  );

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    if (!disabled) inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = '';
    },
    [handleFiles]
  );

  const handleCameraChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      handleFiles(e.target.files);
      if (cameraRef.current) cameraRef.current.value = '';
    },
    [handleFiles]
  );

  return (
    <div className={cn('space-y-3', className)}>
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={handleClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick();
        }}
        aria-label="Upload photos"
        className={cn(
          'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors',
          isDragOver
            ? 'border-app-accent bg-app-accent/10'
            : 'border-muted-foreground/25 hover:border-muted-foreground/50',
          disabled && 'opacity-50 cursor-not-allowed'
        )}
      >
        <Upload className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          <span className="font-medium text-foreground">Click to browse</span> or drag and drop
        </p>
        <p className="text-xs text-muted-foreground">Images up to {maxSizeMb}MB</p>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple
        onChange={handleInputChange}
        className="hidden"
        aria-hidden="true"
      />

      {/* Camera capture (mobile) */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleCameraChange}
        className="hidden"
        aria-hidden="true"
      />
      <Button
        variant="outline"
        size="sm"
        onClick={() => !disabled && cameraRef.current?.click()}
        disabled={disabled}
        className="w-full"
        type="button"
      >
        <Camera className="h-4 w-4 mr-1.5" />
        Take Photo
      </Button>

      {/* Validation error */}
      {validationError && <p className="text-sm text-destructive">{validationError}</p>}

      {/* File preview list */}
      {files.length > 0 && (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.localId}
              className="flex items-center gap-3 rounded-md border border-border p-2"
            >
              {/* Thumbnail */}
              <div className="h-10 w-10 shrink-0 rounded overflow-hidden bg-muted">
                {f.previewUrl ? (
                  <img
                    src={f.previewUrl}
                    alt={f.file.name}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="h-full w-full flex items-center justify-center">
                    <ImageIcon className="h-5 w-5 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* File info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{f.file.name}</p>
                {f.status === 'uploading' && (
                  <div className="mt-1 space-y-1">
                    <Progress value={f.progress ?? 0} className="h-1.5" />
                    <span className="text-xs text-muted-foreground">{f.progress ?? 0}%</span>
                  </div>
                )}
                {f.status !== 'uploading' && (
                  <div className="flex items-center gap-2">
                    {f.status === 'done' && (
                      <span className="text-xs text-green-600">Uploaded</span>
                    )}
                    {f.status === 'error' && (
                      <span className="text-xs text-destructive">{f.error ?? 'Upload failed'}</span>
                    )}
                    {f.status === 'pending' && (
                      <span className="text-xs text-muted-foreground">Ready</span>
                    )}
                    {f.originalSize != null && f.processedSize != null && (
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(f.originalSize)} → {formatBytes(f.processedSize)}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Remove button */}
              {onRemove && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => onRemove(f.localId)}
                  aria-label={`Remove ${f.file.name}`}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
