import { FileText, Upload, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button, Label } from '@pops/ui';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  acceptedTypes?: string;
  maxSizeMB?: number;
  initialFile?: File | null;
}

interface DragHandlers {
  isDragging: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
}

interface DropZoneProps extends DragHandlers {
  hasError: boolean;
  acceptedTypes: string;
  maxSizeMB: number;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function DropZone(props: DropZoneProps) {
  const { isDragging, hasError, acceptedTypes, maxSizeMB } = props;
  const borderClass = isDragging ? 'border-info bg-info/5' : 'border-gray-300 dark:border-gray-700';
  const errorClass = hasError ? 'border-destructive bg-destructive/5' : '';
  return (
    <div
      onDragEnter={props.onDragEnter}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      onDrop={props.onDrop}
      className={`relative border-2 border-dashed rounded-lg p-12 transition-colors duration-200 ease-in-out ${borderClass} ${errorClass}`}
    >
      <Label
        htmlFor="file-upload"
        className="flex flex-col items-center justify-center cursor-pointer"
      >
        <Upload className={`w-12 h-12 mb-4 ${hasError ? 'text-destructive' : 'text-gray-400'}`} />
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          Drop CSV file here or click to browse
        </span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Maximum file size: {maxSizeMB}MB
        </span>
        <input
          id="file-upload"
          type="file"
          accept={acceptedTypes}
          onChange={props.onFileInput}
          tabIndex={0}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          aria-label="Upload CSV file"
        />
      </Label>
    </div>
  );
}

function SelectedFileCard({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between p-4 border-2 border-success bg-success/5 rounded-lg">
      <div className="flex items-center gap-3">
        <FileText className="w-8 h-8 text-success" />
        <div>
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{file.name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {(file.size / 1024).toFixed(2)} KB
          </p>
        </div>
      </div>
      <Button
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className="text-gray-500 hover:text-destructive"
        aria-label="Remove file"
      >
        <X className="w-5 h-5" />
      </Button>
    </div>
  );
}

function useDragHandlers(handleFile: (file: File) => void) {
  const [isDragging, setIsDragging] = useState(false);
  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);
  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0]) handleFile(files[0]);
    },
    [handleFile]
  );
  return { isDragging, onDragEnter, onDragLeave, onDragOver, onDrop };
}

/**
 * Drag-and-drop file upload component
 */
export function FileUpload({
  onFileSelect,
  acceptedTypes = '.csv',
  maxSizeMB = 25,
  initialFile = null,
}: FileUploadProps) {
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile);
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const handleFile = useCallback(
    (file: File) => {
      if (!file.name.endsWith('.csv')) {
        setError('invalid file type. Please upload a CSV file.');
        setSelectedFile(null);
        return;
      }
      if (file.size > maxSizeBytes) {
        setError(`File too large. Maximum size is ${maxSizeMB}MB.`);
        setSelectedFile(null);
        return;
      }
      setError(null);
      setSelectedFile(file);
      onFileSelect(file);
    },
    [maxSizeBytes, maxSizeMB, onFileSelect]
  );

  const { isDragging, onDragEnter, onDragLeave, onDragOver, onDrop } = useDragHandlers(handleFile);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0 && files[0]) handleFile(files[0]);
    },
    [handleFile]
  );

  const handleRemove = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    onFileSelect(null);
  }, [onFileSelect]);

  return (
    <FileUploadView
      selectedFile={selectedFile}
      error={error}
      isDragging={isDragging}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      acceptedTypes={acceptedTypes}
      maxSizeMB={maxSizeMB}
      onRemove={handleRemove}
      onFileInput={handleFileInput}
    />
  );
}

interface FileUploadViewProps extends DragHandlers {
  selectedFile: File | null;
  error: string | null;
  acceptedTypes: string;
  maxSizeMB: number;
  onRemove: () => void;
  onFileInput: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function FileUploadView(p: FileUploadViewProps) {
  return (
    <div className="space-y-4">
      {p.selectedFile ? (
        <SelectedFileCard file={p.selectedFile} onRemove={p.onRemove} />
      ) : (
        <DropZone {...p} hasError={Boolean(p.error)} />
      )}
      {p.error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 dark:text-destructive/40 rounded-md">
          {p.error}
        </div>
      )}
    </div>
  );
}
