/**
 * Channel dispatch facade for AI alerts.
 *
 * Resolves the channel list for a given alert and invokes each dispatcher
 * sequentially, catching per-channel failures so a misconfigured channel
 * doesn't block delivery on the others.
 *
 * The default channel matrix matches PRD-092 US-07:
 *   - in-app nudges always receive every alert (warning + critical)
 *   - Telegram receives only `critical` alerts unless an env override is set
 *     (POPS_ALERTS_TELEGRAM_INCLUDE_WARNINGS=1)
 */
import { logger } from '../../../lib/logger.js';
import { dispatchNudge } from './dispatchers/nudge.js';
import { dispatchTelegram } from './dispatchers/telegram.js';

import type { AlertChannel, FiredAlert } from './types.js';

export interface ChannelDispatchResult {
  channel: AlertChannel;
  delivered: boolean;
  error: string | null;
}

export interface DispatchOptions {
  /** Override channel resolution — useful for testing. */
  channels?: AlertChannel[];
  /** Override the nudge dispatcher (for tests). */
  nudgeDispatcher?: (alert: FiredAlert) => boolean | Promise<boolean>;
  /** Override the telegram dispatcher (for tests). */
  telegramDispatcher?: (alert: FiredAlert) => boolean | Promise<boolean>;
  env?: NodeJS.ProcessEnv;
}

/** Resolve the channel list for a given alert from severity + env config. */
export function resolveChannels(
  alert: FiredAlert,
  env: NodeJS.ProcessEnv = process.env
): AlertChannel[] {
  const channels: AlertChannel[] = ['nudge'];
  const includeWarnings = env['POPS_ALERTS_TELEGRAM_INCLUDE_WARNINGS'] === '1';
  if (alert.severity === 'critical' || includeWarnings) {
    channels.push('telegram');
  }
  return channels;
}

/** Dispatch a single alert across every applicable channel. */
export async function dispatchAlert(
  alert: FiredAlert,
  options: DispatchOptions = {}
): Promise<ChannelDispatchResult[]> {
  const channels = options.channels ?? resolveChannels(alert, options.env);
  const results: ChannelDispatchResult[] = [];

  for (const channel of channels) {
    try {
      let delivered = false;
      if (channel === 'nudge') {
        delivered = options.nudgeDispatcher
          ? await options.nudgeDispatcher(alert)
          : dispatchNudge(alert);
      } else if (channel === 'telegram') {
        delivered = options.telegramDispatcher
          ? await options.telegramDispatcher(alert)
          : await dispatchTelegram(alert);
      }
      results.push({ channel, delivered, error: null });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(
        { alertId: alert.id, channel, error: message },
        '[ai-alerts/dispatch] Channel dispatch failed'
      );
      results.push({ channel, delivered: false, error: message });
    }
  }

  return results;
}
