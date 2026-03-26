/**
 * RadarChart — SVG spider/radar chart for displaying Elo scores across dimensions.
 *
 * Pure SVG implementation with no external charting dependencies.
 */

interface RadarChartProps {
  /** Dimension name → score pairs */
  dimensions: { name: string; score: number }[];
  /** Chart size in pixels (width & height) */
  size?: number;
  /** Minimum score for the inner ring (defaults to 1200) */
  minScore?: number;
  /** Maximum score for the outer ring (defaults to 1800) */
  maxScore?: number;
}

/** Number of concentric grid rings to draw */
const GRID_RINGS = 4;

export function RadarChart({
  dimensions,
  size = 280,
  minScore = 1200,
  maxScore = 1800,
}: RadarChartProps) {
  if (dimensions.length < 3) return null;

  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 40; // Leave room for labels
  const angleStep = (2 * Math.PI) / dimensions.length;

  /** Convert a dimension index + normalized value (0–1) to SVG coordinates. */
  function polarToXY(index: number, value: number): [number, number] {
    const angle = index * angleStep - Math.PI / 2; // Start from top
    return [cx + radius * value * Math.cos(angle), cy + radius * value * Math.sin(angle)];
  }

  /** Normalize a score to 0–1 range, clamped. */
  function normalize(score: number): number {
    return Math.max(0, Math.min(1, (score - minScore) / (maxScore - minScore)));
  }

  // Build grid rings
  const gridRings = Array.from({ length: GRID_RINGS }, (_, i) => {
    const fraction = (i + 1) / GRID_RINGS;
    const points = dimensions.map((_, idx) => polarToXY(idx, fraction).join(",")).join(" ");
    return points;
  });

  // Build axis lines
  const axisLines = dimensions.map((_, idx) => {
    const [x, y] = polarToXY(idx, 1);
    return { x1: cx, y1: cy, x2: x, y2: y };
  });

  // Build data polygon
  const dataPoints = dimensions
    .map((d, idx) => polarToXY(idx, normalize(d.score)).join(","))
    .join(" ");

  // Label positions (slightly outside the chart)
  const labels = dimensions.map((d, idx) => {
    const [x, y] = polarToXY(idx, 1.2);
    return { x, y, name: d.name, score: Math.round(d.score) };
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="mx-auto"
      role="img"
      aria-label="Radar chart showing scores across dimensions"
    >
      {/* Grid rings */}
      {gridRings.map((points, i) => (
        <polygon
          key={`ring-${i}`}
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={0.5}
          opacity={0.15}
        />
      ))}

      {/* Axis lines */}
      {axisLines.map((line, i) => (
        <line
          key={`axis-${i}`}
          x1={line.x1}
          y1={line.y1}
          x2={line.x2}
          y2={line.y2}
          stroke="currentColor"
          strokeWidth={0.5}
          opacity={0.15}
        />
      ))}

      {/* Data polygon */}
      <polygon
        points={dataPoints}
        fill="hsl(var(--primary))"
        fillOpacity={0.2}
        stroke="hsl(var(--primary))"
        strokeWidth={2}
      />

      {/* Data points */}
      {dimensions.map((d, idx) => {
        const [x, y] = polarToXY(idx, normalize(d.score));
        return <circle key={`point-${idx}`} cx={x} cy={y} r={3} fill="hsl(var(--primary))" />;
      })}

      {/* Labels */}
      {labels.map((label, idx) => {
        // Determine text-anchor based on position
        const angle = idx * angleStep - Math.PI / 2;
        const cos = Math.cos(angle);
        let textAnchor: "start" | "middle" | "end" = "middle";
        if (cos > 0.1) textAnchor = "start";
        else if (cos < -0.1) textAnchor = "end";

        return (
          <text
            key={`label-${idx}`}
            x={label.x}
            y={label.y}
            textAnchor={textAnchor}
            dominantBaseline="central"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {label.name}
          </text>
        );
      })}
    </svg>
  );
}
