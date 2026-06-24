/**
 * GliaDigestService — assembles + (optionally) delivers the autonomous-action
 * digest.
 *
 * Three suppression rules govern delivery:
 *   1. zero autonomous actions in the window → suppress.
 *   2. every action type in the digest is in the silent phase → suppress.
 *   3. no delivery channels configured → suppress.
 *
 * The `deliver: false` caller flag short-circuits delivery entirely.
 */
import {
  buildAutonomousDigest,
  dailyDigestRange,
  renderAutonomousDigestText,
  weeklyDigestRange,
} from './autonomous-digest.js';

import type { GliaActionService } from './action-service.js';
import type { AutonomousDigestReport } from './autonomous-digest.js';
import type { DeliveryChannelResult, DigestDeliveryChannels } from './digest-channels.js';
import type { ActionType, GliaTrustState, TrustPhase } from './types.js';

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
    if (report.totalAutonomousActions === 0) {
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
      // suppresses delivery.
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
