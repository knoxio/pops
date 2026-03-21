import * as React from "react";
import { Card } from "../primitives/card";
import { cn } from "../lib/utils";

const statCardColorMap = {
  emerald: {
    text: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/20",
    glow: "shadow-[0_0_20px_-12px_rgba(16,185,129,0.3)]",
  },
  rose: {
    text: "text-rose-600 dark:text-rose-400",
    bg: "bg-rose-500/10",
    border: "border-rose-500/20",
    glow: "shadow-[0_0_20px_-12px_rgba(244,63,94,0.3)]",
  },
  indigo: {
    text: "text-indigo-600 dark:text-indigo-400",
    bg: "bg-indigo-500/10",
    border: "border-indigo-500/20",
    glow: "shadow-[0_0_20px_-12px_rgba(99,102,241,0.3)]",
  },
  amber: {
    text: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10",
    border: "border-amber-500/20",
    glow: "shadow-[0_0_20px_-12px_rgba(245,158,11,0.3)]",
  },
  sky: {
    text: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/10",
    border: "border-sky-500/20",
    glow: "shadow-[0_0_20px_-12px_rgba(14,165,233,0.3)]",
  },
  violet: {
    text: "text-violet-600 dark:text-violet-400",
    bg: "bg-violet-500/10",
    border: "border-violet-500/20",
    glow: "shadow-[0_0_20px_-12px_rgba(139,92,246,0.3)]",
  },
  slate: {
    text: "text-slate-600 dark:text-slate-400",
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
    glow: "shadow-none",
  },
} as const;

export type StatCardColor = keyof typeof statCardColorMap;

export interface StatCardProps {
  title: string;
  value: string | number;
  description?: React.ReactNode;
  color?: StatCardColor;
  className?: string;
}

/**
 * StatCard — a high-impact card for displaying key metrics.
 * Features domain-specific coloring and subtle glow effects.
 */
export function StatCard({
  title,
  value,
  description,
  color = "slate",
  className,
}: StatCardProps) {
  const styles = statCardColorMap[color];

  return (
    <Card
      className={cn(
        "p-5 flex flex-col gap-1 justify-between relative overflow-hidden group transition-all duration-300 hover:scale-[1.02]",
        styles.glow,
        styles.border,
        className
      )}
    >
      <div
        className={cn(
          "absolute top-0 right-0 w-24 h-24 -mr-8 -mt-8 rounded-full blur-3xl transition-opacity opacity-50 group-hover:opacity-80",
          styles.bg
        )}
      />
      <div className="space-y-1 relative z-10">
        <h3 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
          {title}
        </h3>
        <p
          className={cn(
            "text-3xl font-bold tabular-nums tracking-tight",
            styles.text
          )}
        >
          {value}
        </p>
      </div>
      {description && (
        <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter opacity-70 relative z-10">
          {description}
        </div>
      )}
    </Card>
  );
}
