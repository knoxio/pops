import { Ban, Clock, EyeOff } from 'lucide-react';

export const TIERS = ['S', 'A', 'B', 'C', 'D'] as const;
export type Tier = (typeof TIERS)[number];

export const TIER_COLORS: Record<Tier, string> = {
  S: 'bg-destructive/20 border-destructive/40 text-destructive',
  A: 'bg-orange-500/20 border-orange-500/40 text-orange-500',
  B: 'bg-warning/20 border-warning/40 text-warning',
  C: 'bg-success/20 border-success/40 text-success',
  D: 'bg-info/20 border-info/40 text-info',
};

export const TIER_LABEL_COLORS: Record<Tier, string> = {
  S: 'bg-destructive text-destructive-foreground',
  A: 'bg-orange-500 text-white',
  B: 'bg-warning text-warning-foreground',
  C: 'bg-success text-success-foreground',
  D: 'bg-info text-info-foreground',
};

export interface TierMovie {
  mediaType: string;
  mediaId: number;
  title: string;
  posterUrl: string | null;
  score: number;
  comparisonCount: number;
  /** Persisted tier override from a previous submission, or null if unranked. */
  tierOverride: Tier | null;
}

export type TierPlacements = Record<Tier, number[]>;

export const DISMISS_ZONES = ['not-watched', 'stale', 'n-a'] as const;
export type DismissZone = (typeof DISMISS_ZONES)[number];

export const DISMISS_ZONE_CONFIG: Record<
  DismissZone,
  { label: string; icon: typeof EyeOff; color: string }
> = {
  'not-watched': {
    label: 'Not Watched',
    icon: EyeOff,
    color: 'border-destructive/40 text-destructive/80 bg-destructive/10',
  },
  stale: {
    label: 'Stale',
    icon: Clock,
    color: 'border-warning/40 text-warning/80 bg-warning/10',
  },
  'n-a': {
    label: 'N/A',
    icon: Ban,
    color: 'border-muted-foreground/40 text-muted-foreground bg-muted/30',
  },
};
