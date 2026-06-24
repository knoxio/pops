/**
 * GliaTrustMachine — phase transitions and automatic demotion.
 *
 * Evaluates graduation/demotion for each action type after every decide or
 * revert. Transitions are checked eagerly, not on a schedule. Demotion is
 * checked first (safety net), then graduation.
 *
 * Thresholds are read through the injected `getThresholds` accessor (built by
 * `makeGliaThresholdReader` so toml edits hot-reload); the machine never reads
 * config or the DB directly.
 */
import type { GliaActionService } from './action-service.js';
import type { ActionType, GliaTrustState, GraduationThresholds, TrustPhase } from './types.js';

/** Result of a graduation check. */
export interface TransitionResult {
  transitioned: boolean;
  actionType: ActionType;
  oldPhase: TrustPhase;
  newPhase: TrustPhase;
  reason: string;
}

export class GliaTrustMachine {
  constructor(
    private readonly actionService: GliaActionService,
    private readonly getThresholds: () => GraduationThresholds,
    private readonly now: () => Date = () => new Date()
  ) {}

  /**
   * Check whether an action type should graduate or be demoted.
   * Called after every decide or revert operation.
   */
  checkGraduation(actionType: ActionType): TransitionResult {
    const state = this.actionService.getTrustState(actionType);
    if (!state) {
      return {
        transitioned: false,
        actionType,
        oldPhase: 'propose',
        newPhase: 'propose',
        reason: 'Trust state not initialized',
      };
    }

    const demotionResult = this.checkDemotion(actionType, state);
    if (demotionResult.transitioned) {
      return demotionResult;
    }

    return this.checkPromotion(actionType, state);
  }

  /**
   * Evaluate demotion: N+ reverts in a rolling window → reset to propose.
   * Applies to any phase except propose (already at lowest).
   */
  private checkDemotion(actionType: ActionType, state: GliaTrustState): TransitionResult {
    const noTransition: TransitionResult = {
      transitioned: false,
      actionType,
      oldPhase: state.currentPhase,
      newPhase: state.currentPhase,
      reason: 'No demotion triggered',
    };

    if (state.currentPhase === 'propose') {
      return noTransition;
    }

    const thresholds = this.getThresholds();
    const windowMs = thresholds.demotionWindowDays * 24 * 60 * 60 * 1000;
    const windowStart = new Date(this.now().getTime() - windowMs).toISOString();

    const recentReverts = this.actionService.countRevertsInWindow(actionType, windowStart);

    if (recentReverts >= thresholds.demotionRevertThreshold) {
      const timestamp = this.now().toISOString();
      const oldPhase = state.currentPhase;

      this.actionService.updateTrustState(actionType, {
        currentPhase: 'propose',
        approvedCount: 0,
        rejectedCount: 0,
        revertedCount: 0,
        autonomousSince: null,
        graduatedAt: timestamp,
      });

      return {
        transitioned: true,
        actionType,
        oldPhase,
        newPhase: 'propose',
        reason: `Demoted: ${recentReverts} reverts in ${thresholds.demotionWindowDays}-day window (threshold: ${thresholds.demotionRevertThreshold})`,
      };
    }

    return noTransition;
  }

  /**
   * Evaluate graduation:
   *   propose → act_report: enough approvals, low rejection rate
   *   act_report → silent: enough days in act_report, 0 reverts
   */
  private checkPromotion(actionType: ActionType, state: GliaTrustState): TransitionResult {
    const noTransition: TransitionResult = {
      transitioned: false,
      actionType,
      oldPhase: state.currentPhase,
      newPhase: state.currentPhase,
      reason: 'Graduation criteria not met',
    };

    const thresholds = this.getThresholds();

    if (state.currentPhase === 'propose') {
      return this.checkProposeToActReport(actionType, state, thresholds);
    }

    if (state.currentPhase === 'act_report') {
      return this.checkActReportToSilent(actionType, state, thresholds);
    }

    return noTransition;
  }

  private checkProposeToActReport(
    actionType: ActionType,
    state: GliaTrustState,
    thresholds: GraduationThresholds
  ): TransitionResult {
    const noTransition: TransitionResult = {
      transitioned: false,
      actionType,
      oldPhase: 'propose',
      newPhase: 'propose',
      reason: 'Graduation criteria not met',
    };

    if (state.approvedCount < thresholds.proposeToActReportMinApproved) {
      return {
        ...noTransition,
        reason: `Need ${thresholds.proposeToActReportMinApproved} approvals, have ${state.approvedCount}`,
      };
    }

    const totalDecisions = state.approvedCount + state.rejectedCount;
    const rejectionRate = totalDecisions > 0 ? state.rejectedCount / totalDecisions : 0;

    if (rejectionRate >= thresholds.proposeToActReportMaxRejectionRate) {
      return {
        ...noTransition,
        reason: `Rejection rate ${(rejectionRate * 100).toFixed(1)}% exceeds threshold ${(thresholds.proposeToActReportMaxRejectionRate * 100).toFixed(1)}%`,
      };
    }

    const timestamp = this.now().toISOString();
    this.actionService.updateTrustState(actionType, {
      currentPhase: 'act_report',
      autonomousSince: timestamp,
      graduatedAt: timestamp,
    });

    return {
      transitioned: true,
      actionType,
      oldPhase: 'propose',
      newPhase: 'act_report',
      reason: `Graduated: ${state.approvedCount} approvals, ${(rejectionRate * 100).toFixed(1)}% rejection rate`,
    };
  }

  private checkActReportToSilent(
    actionType: ActionType,
    state: GliaTrustState,
    thresholds: GraduationThresholds
  ): TransitionResult {
    const noTransition: TransitionResult = {
      transitioned: false,
      actionType,
      oldPhase: 'act_report',
      newPhase: 'act_report',
      reason: 'Graduation criteria not met',
    };

    if (!state.autonomousSince) {
      return {
        ...noTransition,
        reason: 'No autonomous_since timestamp',
      };
    }

    const autonomousSinceMs = new Date(state.autonomousSince).getTime();
    const nowMs = this.now().getTime();
    const daysInPhase = (nowMs - autonomousSinceMs) / (24 * 60 * 60 * 1000);

    if (daysInPhase < thresholds.actReportToSilentMinDays) {
      return {
        ...noTransition,
        reason: `Need ${thresholds.actReportToSilentMinDays} days in act_report, have ${Math.floor(daysInPhase)}`,
      };
    }

    if (state.revertedCount > 0) {
      return {
        ...noTransition,
        reason: `Cannot graduate with ${state.revertedCount} reverts during act_report phase`,
      };
    }

    const timestamp = this.now().toISOString();
    this.actionService.updateTrustState(actionType, {
      currentPhase: 'silent',
      graduatedAt: timestamp,
    });

    return {
      transitioned: true,
      actionType,
      oldPhase: 'act_report',
      newPhase: 'silent',
      reason: `Graduated: ${Math.floor(daysInPhase)} days in act_report with 0 reverts`,
    };
  }
}
