/**
 * PreferenceProfile — visualisation of genre distribution, genre affinity,
 * and dimension weights on the Discover page.
 */
import { Link } from "react-router";
import { Skeleton } from "@pops/ui";
import { Swords, BarChart3, Heart, Weight } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

interface GenreDistribution {
  genre: string;
  watchCount: number;
  percentage: number;
}

interface GenreAffinity {
  genre: string;
  avgScore: number;
  movieCount: number;
  totalComparisons: number;
}

interface DimensionWeight {
  dimensionId: number;
  name: string;
  comparisonCount: number;
  avgScore: number;
}

interface PreferenceProfileData {
  genreDistribution: GenreDistribution[];
  genreAffinities: GenreAffinity[];
  dimensionWeights: DimensionWeight[];
  totalMoviesWatched: number;
  totalComparisons: number;
}

interface PreferenceProfileProps {
  data: PreferenceProfileData | undefined;
  isLoading: boolean;
}

const CHART_COLORS = [
  "var(--color-primary)",
  "hsl(220, 70%, 55%)",
  "hsl(260, 60%, 55%)",
  "hsl(340, 65%, 55%)",
  "hsl(30, 70%, 50%)",
  "hsl(160, 55%, 45%)",
  "hsl(190, 60%, 50%)",
  "hsl(280, 50%, 55%)",
];

function CompareCTA() {
  return (
    <div
      className="rounded-lg border border-dashed border-border p-6 text-center"
      data-testid="compare-cta"
    >
      <Swords className="mx-auto mb-2 h-6 w-6 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Compare movies to see your preferences</p>
      <Link
        to="/media/compare"
        className="mt-3 inline-flex items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        Start Comparing
      </Link>
    </div>
  );
}

export function PreferenceProfile({ data, isLoading }: PreferenceProfileProps) {
  if (isLoading) {
    return (
      <section className="space-y-6" data-testid="preference-profile-loading">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </section>
    );
  }

  if (!data || data.totalMoviesWatched === 0) return null;

  const hasComparisons = data.totalComparisons > 0;

  return (
    <section className="space-y-8" data-testid="preference-profile">
      <h2 className="text-xl font-bold">Your Preference Profile</h2>

      {/* Genre Distribution */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-muted-foreground uppercase tracking-wider">
          <BarChart3 className="h-4 w-4" />
          Genre Distribution
        </h3>
        {data.genreDistribution.length > 0 ? (
          <div data-testid="genre-distribution-chart">
            <ResponsiveContainer width="100%" height={256}>
              <BarChart
                data={data.genreDistribution.slice(0, 10)}
                layout="vertical"
                margin={{ top: 0, right: 20, bottom: 0, left: 80 }}
              >
                <XAxis type="number" allowDecimals={false} />
                <YAxis type="category" dataKey="genre" width={80} tick={{ fontSize: 12 }} />
                <Tooltip
                  formatter={(value) => [`${value} movies`, "Count"]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="watchCount" radius={[0, 4, 4, 0]}>
                  {data.genreDistribution.slice(0, 10).map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No genre data available.</p>
        )}
      </div>

      {/* Genre Affinity */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-muted-foreground uppercase tracking-wider">
          <Heart className="h-4 w-4" />
          Genre Affinity
        </h3>
        {hasComparisons ? (
          <div className="space-y-2" data-testid="genre-affinity-list">
            {[...data.genreAffinities]
              .sort((a, b) => b.avgScore - a.avgScore)
              .slice(0, 10)
              .map((item, i, sorted) => {
                const maxScore = sorted[0]?.avgScore ?? 1;
                const pct = Math.round((item.avgScore / maxScore) * 100);
                return (
                  <div key={item.genre} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-4 text-right">{i + 1}</span>
                    <span className="text-sm font-medium w-24 truncate">{item.genre}</span>
                    <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-muted-foreground w-16 text-right">
                      {item.avgScore.toFixed(0)} avg
                    </span>
                  </div>
                );
              })}
          </div>
        ) : (
          <CompareCTA />
        )}
      </div>

      {/* Dimension Weights */}
      <div>
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-3 text-muted-foreground uppercase tracking-wider">
          <Weight className="h-4 w-4" />
          Dimension Weights
        </h3>
        {hasComparisons && data.dimensionWeights.length > 0 ? (
          <div data-testid="dimension-weights-chart">
            <ResponsiveContainer width="100%" height={192}>
              <BarChart
                data={data.dimensionWeights}
                margin={{ top: 0, right: 20, bottom: 0, left: 20 }}
              >
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} />
                <Tooltip
                  formatter={(value) => [`${value} comparisons`, "Activity"]}
                  contentStyle={{ fontSize: 12 }}
                />
                <Bar dataKey="comparisonCount" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <CompareCTA />
        )}
      </div>
    </section>
  );
}
