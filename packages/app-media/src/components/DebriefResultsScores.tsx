import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

interface ScoreEntry {
  dimensionId: number;
  score: number;
}

interface DimensionEntry {
  dimensionId: number;
  name: string;
}

function getDeltaClasses(delta: number): string {
  if (delta > 0) return 'bg-success/20 text-success';
  if (delta < 0) return 'bg-destructive/20 text-destructive';
  return 'bg-muted text-muted-foreground';
}

function DeltaIcon({ delta }: { delta: number }) {
  if (delta > 0) return <ArrowUpRight className="h-3 w-3" />;
  if (delta < 0) return <ArrowDownRight className="h-3 w-3" />;
  return <Minus className="h-3 w-3" />;
}

function ScoreRow({ s, dimName }: { s: ScoreEntry; dimName: string }) {
  const delta = Math.round(s.score - 1500);
  const isPositive = delta > 0;
  return (
    <div className="flex items-center justify-between text-sm">
      <span>{dimName}</span>
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{Math.round(s.score)}</span>
        <span
          className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-medium ${getDeltaClasses(delta)}`}
          data-testid={`score-delta-${s.dimensionId}`}
        >
          <DeltaIcon delta={delta} />
          {isPositive ? '+' : ''}
          {delta}
        </span>
      </div>
    </div>
  );
}

export function CurrentScoresList({
  scores,
  dimensions,
}: {
  scores: ScoreEntry[];
  dimensions: DimensionEntry[];
}) {
  const dimNameById = new Map(dimensions.map((d) => [d.dimensionId, d.name]));
  return (
    <div className="border-t pt-4 space-y-2">
      <h3 className="text-sm font-medium text-muted-foreground">Current Scores</h3>
      <div className="space-y-1.5">
        {scores.map((s) => (
          <ScoreRow
            key={s.dimensionId}
            s={s}
            dimName={dimNameById.get(s.dimensionId) ?? `Dimension ${s.dimensionId}`}
          />
        ))}
      </div>
    </div>
  );
}
