import { Upload } from 'lucide-react';
import { useCallback, useState } from 'react';

import { cn } from '../../lib/utils';

interface DropZoneProps {
  disabled: boolean;
  maxSizeMb: number;
  onClick: () => void;
  onFiles: (files: FileList) => void;
}

export function DropZone({ disabled, maxSizeMb, onClick, onFiles }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      onFiles(e.dataTransfer.files);
    },
    [disabled, onFiles]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        setIsDragOver(false);
      }}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick();
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
  );
}
