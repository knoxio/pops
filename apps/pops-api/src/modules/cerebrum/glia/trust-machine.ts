import { getGliaThresholds } from './types.js';

/**
 * GliaTrustMachine — phase transitions and automatic demotion.
 *
 * Evaluates graduation/demotion for each action type after every
 * decideAction or revertAction call. Transitions are checked eagerly,
 * not on a schedule.
 *
 * PRD-086 US-03: Graduation Logic.
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
    private readonly getThresholds: () => GraduationThresholds = getGliaThresholds,
    private readonly now: () => Date = () => new Date()
  ) {}

  /**
   * Check whether an action type should graduate or be demoted.
   * Called after every decide or revert operation.
   *
   * Evaluates demotion first (safety net), then graduation.
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

    // Check demotion first — safety takes precedence
    const demotionResult = this.checkDemotion(actionType, state);
    if (demotionResult.transitioned) {
      return demotionResult;
    }

    // Then check graduation
    return this.checkPromotion(actionType, state);
  }

  /**
   * Evaluate demotion: 2+ reverts in a rolling 7-day window → reset to propose.
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

      // Reset to propose with zeroed counters
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
   *   propose → act_report: 20+ approved, <10% rejection rate
   *   act_report → silent: 60+ days in act_report, 0 reverts
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

    // Already in silent — no further promotion possible
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

    // Graduate!
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

    // Graduate!
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
