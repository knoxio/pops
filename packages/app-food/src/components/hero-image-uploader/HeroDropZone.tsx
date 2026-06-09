/**
 * Drop-zone for the empty hero state (PRD-124). Exposed as a `role="button"`
 * so keyboard activation (Enter / Space) opens the file picker — drag-drop
 * is supported alongside the click path.
 */
import type { JSX } from 'react';

export interface HeroDropZoneProps {
  dropLabelId: string;
  isBusy: boolean;
  uploadIsPending: boolean;
  dragOver: boolean;
  maxBytes: number;
  onClick: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  labels: { dropPrompt: string; uploading: string; acceptHint: string };
}

export function HeroDropZone(props: HeroDropZoneProps): JSX.Element {
  const sizeMb = Math.floor(props.maxBytes / (1024 * 1024));
  return (
    <div
      role="button"
      tabIndex={0}
      aria-labelledby={props.dropLabelId}
      aria-disabled={props.isBusy}
      onClick={props.onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          props.onClick();
        }
      }}
      onDrop={props.onDrop}
      onDragOver={props.onDragOver}
      onDragLeave={props.onDragLeave}
      className={[
        'flex min-h-[176px] cursor-pointer flex-col items-center justify-center gap-2',
        'rounded-lg border-2 border-dashed p-6 text-center transition-colors',
        props.dragOver ? 'border-primary bg-muted' : 'border-muted-foreground/30 hover:bg-muted/50',
        props.isBusy ? 'pointer-events-none opacity-60' : '',
      ].join(' ')}
    >
      <span id={props.dropLabelId} className="font-medium">
        {props.uploadIsPending ? props.labels.uploading : props.labels.dropPrompt}
      </span>
      <span className="text-sm text-muted-foreground">
        {props.labels.acceptHint.replace('{{mb}}', String(sizeMb))}
      </span>
    </div>
  );
}
