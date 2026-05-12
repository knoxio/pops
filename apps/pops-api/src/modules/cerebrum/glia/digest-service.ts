/**
 * Digest service for autonomous Glia actions (PRD-086 US-04 AC #5/#6, #2577).
 *
 * Orchestrates the autonomous-action digest pipeline:
 *   1. Query autonomous actions in the requested period.
 *   2. Gather post-graduation execution/revert counts per action type.
 *   3. Build the digest payload (`buildAutonomousDigest`).
 *   4. Optionally deliver via shell notification (nudge_log) and Moltbot
 *      (Telegram).
 *
 * Phase handling (PRD-086 US-04 AC #6):
 *   - Delivery is allowed only when at least one action type currently in
 *     the digest is in `act_report` phase.
 *   - If every action type in the digest is in `silent` phase, delivery is
 *     suppressed — silent-phase types intentionally produce no digest.
 *   - Empty digests are suppressed entirely (edge case in PRD-086 README:
 *     "Digest generated with zero autonomous actions ... no notification
 *     sent").
 */
import {
  buildAutonomousDigest,
  dailyDigestRange,
  renderAutonomousDigestText,
  weeklyDigestRange,
} from './digest-reports.js';
import { ACTION_TYPES } from './types.js';

import type { GliaActionService } from './action-service.js';
import type { AutonomousDigestReport } from './digest-reports.js';
import type { ActionType, GliaTrustState, TrustPhase } from './types.js';

/** Output of a single delivery channel. */
export interface DeliveryChannelResult {
  channel: 'shell' | 'moltbot';
  delivered: boolean;
  /** Reason for non-delivery — populated when `delivered=false`. */
  reason: string | null;
}

export interface DigestDeliveryResult {
  /** Whether delivery was attempted at all (false when suppressed). */
  attempted: boolean;
  /** Reason for suppression — null when `attempted=true`. */
  suppressedReason: string | null;
  channels: DeliveryChannelResult[];
}

export interface DigestResult {
  report: AutonomousDigestReport;
  delivery: DigestDeliveryResult;
}

export interface GenerateDigestInput {
  period?: 'daily' | 'weekly';
  /** Restrict the digest to a single action type. */
  actionType?: ActionType;
  /** Override the anomaly threshold (default 30%). */
  rejectionRateThreshold?: number;
  /** When false, the digest is computed but not delivered. Default true. */
  deliver?: boolean;
}

/** Channels invoked by the digest delivery step. */
export interface DigestDeliveryChannels {
  /** Persist a shell notification. Returns true when accepted. */
  shell: (report: AutonomousDigestReport, body: string) => Promise<boolean> | boolean;
  /** Forward to Moltbot/Telegram. Returns true when sent. */
  moltbot: (report: AutonomousDigestReport, body: string) => Promise<boolean>;
}

export interface DigestServiceOptions {
  now?: () => Date;
  channels?: DigestDeliveryChannels;
}

export class GliaDigestService {
  private readonly now: () => Date;
  private readonly channels: DigestDeliveryChannels | null;

  constructor(
    private readonly actionService: GliaActionService,
    options: DigestServiceOptions = {}
  ) {
    this.now = options.now ?? (() => new Date());
    this.channels = options.channels ?? null;
  }

  async generate(input: GenerateDigestInput = {}): Promise<DigestResult> {
    const period = input.period ?? 'daily';
    const { startDate, endDate } =
      period === 'daily' ? dailyDigestRange(this.now()) : weeklyDigestRange(this.now());

    let actions = this.actionService.listAutonomousActionsInWindow(startDate, endDate);
    if (input.actionType) {
      actions = actions.filter((a) => a.actionType === input.actionType);
    }

    const trustStates = this.actionService.listTrustStates();
    const filteredTrustStates = input.actionType
      ? trustStates.filter((s) => s.actionType === input.actionType)
      : trustStates;

    const { executedByType, revertedByType } = this.gatherPostGraduationCounts(filteredTrustStates);

    const report = buildAutonomousDigest({
      actions,
      trustStates: filteredTrustStates,
      postGraduationExecutedByType: executedByType,
      postGraduationRevertedByType: revertedByType,
      period,
      startDate,
      endDate,
      rejectionRateThreshold: input.rejectionRateThreshold,
    });

    const deliver = input.deliver ?? true;
    const delivery = deliver
      ? await this.maybeDeliver(report, trustStates)
      : { attempted: false, suppressedReason: 'Delivery disabled by caller', channels: [] };

    return { report, delivery };
  }

  private gatherPostGraduationCounts(trustStates: GliaTrustState[]): {
    executedByType: Partial<Record<ActionType, number>>;
    revertedByType: Partial<Record<ActionType, number>>;
  } {
    const executedByType: Partial<Record<ActionType, number>> = {};
    const revertedByType: Partial<Record<ActionType, number>> = {};

    for (const state of trustStates) {
      if (!state.autonomousSince) continue;
      executedByType[state.actionType] = this.actionService.countAutonomousExecutionsSince(
        state.actionType,
        state.autonomousSince
      );
      revertedByType[state.actionType] = this.actionService.countAutonomousRevertsSince(
        state.actionType,
        state.autonomousSince
      );
    }

    return { executedByType, revertedByType };
  }

  private async maybeDeliver(
    report: AutonomousDigestReport,
    allTrustStates: GliaTrustState[]
  ): Promise<DigestDeliveryResult> {
    if (report.totalAutonomousActions === 0 && report.anomalies.length === 0) {
      return {
        attempted: false,
        suppressedReason: 'No autonomous actions in period',
        channels: [],
      };
    }

    const phasesInReport = collectPhasesInReport(report, allTrustStates);
    if (!phasesInReport.has('act_report')) {
      // Every type in the digest is silent (or somehow propose, which would
      // mean no autonomous actions — handled above). Silent phase intentionally
      // suppresses delivery per PRD-086 US-04 AC #6.
      return {
        attempted: false,
        suppressedReason: 'All action types in digest are in silent phase',
        channels: [],
      };
    }

    const channels = this.channels;
    if (!channels) {
      return {
        attempted: false,
        suppressedReason: 'No delivery channels configured',
        channels: [],
      };
    }

    const body = renderAutonomousDigestText(report);
    const channelResults: DeliveryChannelResult[] = [];

    const shellResult = await this.invokeChannel(() => channels.shell(report, body));
    channelResults.push({ channel: 'shell', ...shellResult });

    const moltbotResult = await this.invokeChannel(() => channels.moltbot(report, body));
    channelResults.push({ channel: 'moltbot', ...moltbotResult });

    return { attempted: true, suppressedReason: null, channels: channelResults };
  }

  private async invokeChannel(
    fn: () => Promise<boolean> | boolean
  ): Promise<{ delivered: boolean; reason: string | null }> {
    try {
      const delivered = await fn();
      return delivered
        ? { delivered: true, reason: null }
        : { delivered: false, reason: 'Channel returned false (not configured)' };
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      return { delivered: false, reason };
    }
  }
}

function collectPhasesInReport(
  report: AutonomousDigestReport,
  trustStates: GliaTrustState[]
): Set<TrustPhase> {
  const phaseByType = new Map<ActionType, TrustPhase>();
  for (const state of trustStates) {
    phaseByType.set(state.actionType, state.currentPhase);
  }

  const phases = new Set<TrustPhase>();
  // Phase membership comes from the action types actually represented in the
  // digest (groups + anomalies). If neither, the empty-period guard fired
  // upstream so this is unreachable.
  const typesInReport = new Set<ActionType>();
  for (const group of report.groups) {
    typesInReport.add(group.actionType);
  }
  for (const anomaly of report.anomalies) {
    typesInReport.add(anomaly.actionType);
  }

  for (const type of typesInReport) {
    const phase = phaseByType.get(type);
    if (phase) phases.add(phase);
  }
  return phases;
}

/**
 * Build the canonical list of action types — exported so callers can iterate
 * deterministically when wiring per-type digests.
 */
export function listKnownActionTypes(): readonly ActionType[] {
  return ACTION_TYPES;
}
