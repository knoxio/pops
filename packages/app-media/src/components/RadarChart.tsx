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

interface RadarGeometry {
  cx: number;
  cy: number;
  radius: number;
  angleStep: number;
  polarToXY: (index: number, value: number) => [number, number];
  normalize: (score: number) => number;
}

function buildGeometry(
  size: number,
  count: number,
  minScore: number,
  maxScore: number
): RadarGeometry {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 40;
  const angleStep = (2 * Math.PI) / count;
  return {
    cx,
    cy,
    radius,
    angleStep,
    polarToXY(index, value) {
      const angle = index * angleStep - Math.PI / 2;
      return [cx + radius * value * Math.cos(angle), cy + radius * value * Math.sin(angle)];
    },
    normalize(score) {
      return Math.max(0, Math.min(1, (score - minScore) / (maxScore - minScore)));
    },
  };
}

function GridAndAxes({
  dimensions,
  geom,
}: {
  dimensions: RadarChartProps['dimensions'];
  geom: RadarGeometry;
}) {
  const gridRings = Array.from({ length: GRID_RINGS }, (_, i) => {
    const fraction = (i + 1) / GRID_RINGS;
    return dimensions.map((_, idx) => geom.polarToXY(idx, fraction).join(',')).join(' ');
  });
  return (
    <>
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
      {dimensions.map((_, idx) => {
        const [x, y] = geom.polarToXY(idx, 1);
        return (
          <line
            key={`axis-${idx}`}
            x1={geom.cx}
            y1={geom.cy}
            x2={x}
            y2={y}
            stroke="currentColor"
            strokeWidth={0.5}
            opacity={0.15}
          />
        );
      })}
    </>
  );
}

function DataLayer({
  dimensions,
  geom,
}: {
  dimensions: RadarChartProps['dimensions'];
  geom: RadarGeometry;
}) {
  const dataPoints = dimensions
    .map((d, idx) => geom.polarToXY(idx, geom.normalize(d.score)).join(','))
    .join(' ');
  return (
    <>
      <polygon
        points={dataPoints}
        fill="var(--primary)"
        fillOpacity={0.2}
        stroke="var(--primary)"
        strokeWidth={2}
      />
      {dimensions.map((d, idx) => {
        const [x, y] = geom.polarToXY(idx, geom.normalize(d.score));
        return <circle key={`point-${idx}`} cx={x} cy={y} r={3} fill="var(--primary)" />;
      })}
    </>
  );
}

function getTextAnchor(angle: number): 'start' | 'middle' | 'end' {
  const cos = Math.cos(angle);
  if (cos > 0.1) return 'start';
  if (cos < -0.1) return 'end';
  return 'middle';
}

function Labels({
  dimensions,
  geom,
}: {
  dimensions: RadarChartProps['dimensions'];
  geom: RadarGeometry;
}) {
  return (
    <>
      {dimensions.map((d, idx) => {
        const [x, y] = geom.polarToXY(idx, 1.2);
        const angle = idx * geom.angleStep - Math.PI / 2;
        return (
          <text
            key={`label-${idx}`}
            x={x}
            y={y}
            textAnchor={getTextAnchor(angle)}
            dominantBaseline="central"
            className="fill-muted-foreground"
            fontSize={11}
          >
            {d.name}
          </text>
        );
      })}
    </>
  );
}

export function RadarChart({
  dimensions,
  size = 280,
  minScore = 1200,
  maxScore = 1800,
}: RadarChartProps) {
  if (dimensions.length < 3) return null;
  const geom = buildGeometry(size, dimensions.length, minScore, maxScore);

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      width={size}
      height={size}
      className="mx-auto"
      role="img"
      aria-label="Radar chart showing scores across dimensions"
    >
      <GridAndAxes dimensions={dimensions} geom={geom} />
      <DataLayer dimensions={dimensions} geom={geom} />
      <Labels dimensions={dimensions} geom={geom} />
    </svg>
  );
}
