/**
 * ComparisonScores — radar chart showing Elo scores across comparison dimensions.
 * Queries scores and dimensions, merges them, and renders a recharts RadarChart.
 * Shows "Not enough data" when total comparisons < 3.
 */
import { Skeleton } from "@pops/ui";
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { trpc } from "../lib/trpc";

/** Normalize an Elo score (typically 1000–2000) to a 0–100 scale. */
function normalizeScore(elo: number): number {
  const clamped = Math.max(1000, Math.min(2000, elo));
  return Math.round(((clamped - 1000) / 1000) * 100);
}

export interface ComparisonScoresProps {
  mediaType: "movie" | "tv_show";
  mediaId: number;
}

export function ComparisonScores({ mediaType, mediaId }: ComparisonScoresProps) {
  const { data: scoresResponse, isLoading: scoresLoading } =
    trpc.media.comparisons.scores.useQuery({ mediaType, mediaId });

  const { data: dimensionsResponse, isLoading: dimensionsLoading } =
    trpc.media.comparisons.listDimensions.useQuery();

  const isLoading = scoresLoading || dimensionsLoading;

  if (isLoading) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-2">Comparison Scores</h2>
        <Skeleton className="h-64 w-full rounded-lg" />
      </section>
    );
  }

  const scores = scoresResponse?.data ?? [];
  const dimensions = dimensionsResponse?.data ?? [];

  // Check if there are enough comparisons (sum of all comparisonCount across dimensions)
  const totalComparisons = scores.reduce((sum, s) => sum + s.comparisonCount, 0);

  if (totalComparisons < 3) {
    return (
      <section>
        <h2 className="text-lg font-semibold mb-2">Comparison Scores</h2>
        <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-border bg-muted/30">
          <p className="text-sm text-muted-foreground">
            Not enough data — at least 3 comparisons needed
          </p>
        </div>
      </section>
    );
  }

  // Build dimension lookup
  const dimensionMap = new Map(dimensions.map((d) => [d.id, d.name]));

  // Merge scores with dimension names, sorted by dimension sortOrder
  const dimensionOrder = new Map(dimensions.map((d) => [d.id, d.sortOrder]));
  const radarData = scores
    .map((s) => ({
      dimension: dimensionMap.get(s.dimensionId) ?? `Dim ${s.dimensionId}`,
      score: normalizeScore(s.score),
      rawScore: Math.round(s.score),
      comparisons: s.comparisonCount,
      sortOrder: dimensionOrder.get(s.dimensionId) ?? 0,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <section>
      <h2 className="text-lg font-semibold mb-2">Comparison Scores</h2>
      <div className="rounded-lg border bg-card p-4">
        <ResponsiveContainer width="100%" height={280}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="75%">
            <PolarGrid stroke="hsl(var(--border))" />
            <PolarAngleAxis
              dataKey="dimension"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }}
            />
            <Radar
              dataKey="score"
              stroke="hsl(var(--primary))"
              fill="hsl(var(--primary))"
              fillOpacity={0.2}
              strokeWidth={2}
            />
            <Tooltip
              content={({ payload }) => {
                if (!payload?.length) return null;
                const entry = payload[0].payload as (typeof radarData)[number];
                return (
                  <div className="rounded-md border bg-popover px-3 py-2 text-sm shadow-md">
                    <p className="font-medium">{entry.dimension}</p>
                    <p className="text-muted-foreground">
                      Elo: {entry.rawScore} ({entry.comparisons} comparisons)
                    </p>
                  </div>
                );
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
