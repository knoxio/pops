/**
 * RadarChart — pure-SVG spider/radar chart primitive.
 *
 * Renders one or more polygons against a labelled axis grid. Intentionally
 * framework-free — no Recharts, no D3.
 */
import { type CSSProperties } from 'react';

import { cn } from '../lib/utils';

export interface RadarSeries {
  id?: string;
  label?: string;
  /** Must be the same length as `axes`. */
  values: number[];
  /** Stroke colour. */
  color?: string;
  /** Fill opacity 0-1. Default 0.2. */
  fillOpacity?: number;
}

export interface RadarChartProps {
  axes: string[];
  series: RadarSeries[];
  /** Max value for the outer ring. Default = max of all series values. */
  max?: number;
  /** Number of concentric grid rings. Default 4. */
  rings?: number;
  /** Chart size in pixels. Default 320. */
  size?: number;
  className?: string;
  style?: CSSProperties;
}

const DEFAULT_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'];

function pointOn(cx: number, cy: number, r: number, angle: number): [number, number] {
  return [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
}

export function RadarChart({
  axes,
  series,
  max,
  rings = 4,
  size = 320,
  className,
  style,
}: RadarChartProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 40;
  const step = (Math.PI * 2) / Math.max(1, axes.length);
  const startAngle = -Math.PI / 2;

  const computedMax =
    max ?? Math.max(1, ...series.flatMap((s) => s.values.filter((v) => Number.isFinite(v))));

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className={cn('h-auto w-full', className)}
      style={style}
      role="img"
      aria-label={`Radar chart over ${axes.length} axes`}
    >
      {/* Grid rings */}
      {Array.from({ length: rings }).map((_, r) => {
        const ratio = (r + 1) / rings;
        const points = axes
          .map((_, i) => {
            const [x, y] = pointOn(cx, cy, radius * ratio, startAngle + i * step);
            return `${x},${y}`;
          })
          .join(' ');
        return (
          <polygon key={r} points={points} fill="none" stroke="currentColor" strokeOpacity={0.15} />
        );
      })}
      {/* Axes spokes */}
      {axes.map((label, i) => {
        const [x2, y2] = pointOn(cx, cy, radius, startAngle + i * step);
        const [lx, ly] = pointOn(cx, cy, radius + 16, startAngle + i * step);
        return (
          <g key={`${label}-${i}`}>
            <line x1={cx} y1={cy} x2={x2} y2={y2} stroke="currentColor" strokeOpacity={0.2} />
            <text
              x={lx}
              y={ly}
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-muted-foreground"
              fontSize={11}
            >
              {label}
            </text>
          </g>
        );
      })}
      {/* Series polygons */}
      {series.map((s, si) => {
        const color = s.color ?? DEFAULT_COLORS[si % DEFAULT_COLORS.length];
        const fillOpacity = s.fillOpacity ?? 0.2;
        const points = s.values
          .map((v, i) => {
            const ratio = Math.max(0, Math.min(1, v / computedMax));
            const [x, y] = pointOn(cx, cy, radius * ratio, startAngle + i * step);
            return `${x},${y}`;
          })
          .join(' ');
        return (
          <g key={s.id ?? si}>
            <polygon
              points={points}
              fill={color}
              fillOpacity={fillOpacity}
              stroke={color}
              strokeWidth={2}
            />
            {s.values.map((v, i) => {
              const ratio = Math.max(0, Math.min(1, v / computedMax));
              const [x, y] = pointOn(cx, cy, radius * ratio, startAngle + i * step);
              return <circle key={i} cx={x} cy={y} r={3} fill={color} />;
            })}
          </g>
        );
      })}
    </svg>
  );
}
