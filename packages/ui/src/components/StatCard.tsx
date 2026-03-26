import * as React from "react";
import { Card } from "../primitives/card";
import { cn } from "../lib/utils";

const statCardColorMap = {
  emerald: {
    text: "text-[oklch(0.6_0.15_150)] dark:text-[oklch(0.7_0.15_150)]",
    bg: "bg-[oklch(0.6_0.15_150)]/15",
    border: "border-[oklch(0.6_0.15_150)]/25",
    glow: "shadow-[0_0_20px_-12px_oklch(0.6_0.15_150/0.4)]",
  },
  rose: {
    text: "text-[oklch(0.6_0.15_25)] dark:text-[oklch(0.7_0.15_25)]",
    bg: "bg-[oklch(0.6_0.15_25)]/15",
    border: "border-[oklch(0.6_0.15_25)]/25",
    glow: "shadow-[0_0_20px_-12px_oklch(0.6_0.15_25/0.4)]",
  },
  indigo: {
    text: "text-[oklch(0.6_0.15_260)] dark:text-[oklch(0.7_0.15_260)]",
    bg: "bg-[oklch(0.6_0.15_260)]/15",
    border: "border-[oklch(0.6_0.15_260)]/25",
    glow: "shadow-[0_0_20px_-12px_oklch(0.6_0.15_260/0.4)]",
  },
  amber: {
    text: "text-[oklch(0.6_0.15_70)] dark:text-[oklch(0.7_0.15_70)]",
    bg: "bg-[oklch(0.6_0.15_70)]/15",
    border: "border-[oklch(0.6_0.15_70)]/25",
    glow: "shadow-[0_0_20px_-12px_oklch(0.6_0.15_70/0.4)]",
  },
  sky: {
    text: "text-[oklch(0.6_0.15_220)] dark:text-[oklch(0.7_0.15_220)]",
    bg: "bg-[oklch(0.6_0.15_220)]/15",
    border: "border-[oklch(0.6_0.15_220)]/25",
    glow: "shadow-[0_0_20px_-12px_oklch(0.6_0.15_220/0.4)]",
  },
  violet: {
    text: "text-[oklch(0.6_0.15_290)] dark:text-[oklch(0.7_0.15_290)]",
    bg: "bg-[oklch(0.6_0.15_290)]/15",
    border: "border-[oklch(0.6_0.15_290)]/25",
    glow: "shadow-[0_0_20px_-12px_oklch(0.6_0.15_290/0.4)]",
  },
  slate: {
    text: "text-foreground/80",
    bg: "bg-muted/50",
    border: "border-border",
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
export function StatCard({ title, value, description, color = "slate", className }: StatCardProps) {
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
        <p className={cn("text-3xl font-bold tabular-nums tracking-tight", styles.text)}>{value}</p>
      </div>
      {description && (
        <div className="text-[10px] text-muted-foreground font-medium uppercase tracking-tighter opacity-70 relative z-10">
          {description}
        </div>
      )}
    </Card>
  );
}
