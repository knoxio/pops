import { FileText, Upload, X } from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button, Label } from '@pops/ui';

interface FileUploadProps {
  onFileSelect: (file: File | null) => void;
  acceptedTypes?: string;
  maxSizeMB?: number;
  initialFile?: File | null;
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
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile);

  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  const validateFile = useCallback(
    (file: File): string | null => {
      // Check file type
      if (!file.name.endsWith('.csv')) {
        return `invalid file type. Please upload a CSV file.`;
      }

      // Check file size
      if (file.size > maxSizeBytes) {
        return `File too large. Maximum size is ${maxSizeMB}MB.`;
      }

      return null;
    },
    [maxSizeBytes, maxSizeMB]
  );

  const handleFile = useCallback(
    (file: File) => {
      const validationError = validateFile(file);
      if (validationError) {
        setError(validationError);
        setSelectedFile(null);
        return;
      }

      setError(null);
      setSelectedFile(file);
      onFileSelect(file);
    },
    [validateFile, onFileSelect]
  );

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);

      const files = e.dataTransfer.files;
      if (files.length > 0 && files[0]) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (files && files.length > 0 && files[0]) {
        handleFile(files[0]);
      }
    },
    [handleFile]
  );

  const handleRemove = useCallback(() => {
    setSelectedFile(null);
    setError(null);
    onFileSelect(null);
  }, [onFileSelect]);

  return (
    <div className="space-y-4">
      {!selectedFile ? (
        <div
          onDragEnter={handleDragEnter}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`
            relative border-2 border-dashed rounded-lg p-12
            transition-colors duration-200 ease-in-out
            ${isDragging ? 'border-info bg-info/5' : 'border-gray-300 dark:border-gray-700'}
            ${error ? 'border-destructive bg-destructive/5' : ''}
          `}
        >
          <Label
            htmlFor="file-upload"
            className="flex flex-col items-center justify-center cursor-pointer"
          >
            <Upload className={`w-12 h-12 mb-4 ${error ? 'text-destructive' : 'text-gray-400'}`} />
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
              onChange={handleFileInput}
              tabIndex={0}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              aria-label="Upload CSV file"
            />
          </Label>
        </div>
      ) : (
        <div className="flex items-center justify-between p-4 border-2 border-success bg-success/5 rounded-lg">
          <div className="flex items-center gap-3">
            <FileText className="w-8 h-8 text-success" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {selectedFile.name}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {(selectedFile.size / 1024).toFixed(2)} KB
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleRemove}
            className="text-gray-500 hover:text-destructive"
            aria-label="Remove file"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
      )}

      {error && (
        <div className="p-3 text-sm text-destructive bg-destructive/10 dark:text-destructive/40 rounded-md">
          {error}
        </div>
      )}
    </div>
  );
}
