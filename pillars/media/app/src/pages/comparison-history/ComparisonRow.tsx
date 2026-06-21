import { Trash2 } from 'lucide-react';

import { Button, Card, CardContent } from '@pops/ui';

import { MovieTitle } from './MovieTitle';

export interface ComparisonRowData {
  id: number;
  mediaAId: number;
  mediaBId: number;
  winnerId: number;
  deltaA: number | null;
  deltaB: number | null;
  drawTier: string | null;
  comparedAt: string;
}

function deltaClasses(delta: number | null): string {
  if (delta === null) return 'text-muted-foreground';
  if (delta > 0) return 'text-success bg-success/10';
  if (delta < 0) return 'text-destructive bg-destructive/10';
  return 'text-muted-foreground';
}

function EloDelta({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  return (
    <span className={`text-2xs font-mono tabular-nums px-1 py-0.5 rounded ${deltaClasses(delta)}`}>
      {delta > 0 ? '+' : ''}
      {delta}
    </span>
  );
}

function DrawRow({ comparison }: { comparison: ComparisonRowData }) {
  return (
    <>
      <MovieTitle mediaId={comparison.mediaAId} className="font-semibold text-foreground" />
      <EloDelta delta={comparison.deltaA} />
      <span className="text-muted-foreground">tied</span>
      <MovieTitle mediaId={comparison.mediaBId} className="text-muted-foreground" />
      <EloDelta delta={comparison.deltaB} />
    </>
  );
}

function WinRow({ comparison }: { comparison: ComparisonRowData }) {
  const winnerId = comparison.winnerId;
  const loserId = comparison.mediaAId === winnerId ? comparison.mediaBId : comparison.mediaAId;
  const winnerDelta = comparison.mediaAId === winnerId ? comparison.deltaA : comparison.deltaB;
  const loserDelta = comparison.mediaAId === winnerId ? comparison.deltaB : comparison.deltaA;
  return (
    <>
      <MovieTitle mediaId={winnerId} className="font-semibold text-foreground" />
      <EloDelta delta={winnerDelta} />
      <span className="text-muted-foreground">beat</span>
      <MovieTitle mediaId={loserId} className="text-muted-foreground" />
      <EloDelta delta={loserDelta} />
    </>
  );
}

export function ComparisonRow({
  comparison,
  dimensionName,
  onDelete,
}: {
  comparison: ComparisonRowData;
  dimensionName: string;
  onDelete: (id: number) => void;
}) {
  const isDraw = comparison.winnerId === 0;
  return (
    <Card className="group">
      <CardContent className="flex items-center justify-between p-3">
        <div className="flex items-center gap-4 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              {isDraw ? <DrawRow comparison={comparison} /> : <WinRow comparison={comparison} />}
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-2xs text-muted-foreground uppercase tracking-wider">
                {dimensionName}
              </span>
              {isDraw && comparison.drawTier && (
                <span className="text-2xs text-muted-foreground capitalize">
                  {comparison.drawTier} draw
                </span>
              )}
              <span className="text-2xs text-muted-foreground">
                {new Date(comparison.comparedAt).toLocaleDateString()}
              </span>
            </div>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onDelete(comparison.id)}
          className="opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}
