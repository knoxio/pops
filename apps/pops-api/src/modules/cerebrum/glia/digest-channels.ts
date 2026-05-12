import { randomUUID } from 'node:crypto';

import { nudgeLog } from '@pops/db-types';

import { getDrizzle } from '../../../db.js';
import { logger } from '../../../lib/logger.js';
import {
  escapeTelegramMarkdownV2,
  fetchTransport,
  readTelegramConfig,
} from '../../core/ai-alerts/dispatchers/telegram.js';

import type { AutonomousDigestReport } from './digest-reports.js';
import type { DigestDeliveryChannels } from './digest-service.js';

/** Map digest urgency to nudge priority — anomalies bump severity. */
function priorityFor(report: AutonomousDigestReport): 'low' | 'medium' | 'high' {
  if (report.anomalies.length > 0) return 'high';
  if (report.totalAutonomousActions >= 10) return 'medium';
  return 'low';
}

function buildShellNudgeId(now: Date): string {
  const pad = (n: number, len: number): string => String(n).padStart(len, '0');
  const date = `${now.getFullYear()}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}`;
  const time = `${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`;
  const ms = pad(now.getMilliseconds(), 3);
  // Append a UUID slice so parallel triggers within the same millisecond still
  // produce distinct IDs — second-level precision alone collides under load.
  const nonce = randomUUID().slice(0, 8);
  return `nudge_${date}_${time}${ms}_${nonce}_gliaDigest`;
}

/**
 * Persist the digest as a shell notification.
 *
 * Engram IDs union'd across all groups so the existing nudge UI can deep-link
 * back to the affected engrams without us needing a separate digest viewer.
 */
export function deliverShellDigest(
  report: AutonomousDigestReport,
  body: string,
  now: Date = new Date()
): boolean {
  const db = getDrizzle();
  const id = buildShellNudgeId(now);
  const title = `Glia ${report.period} digest — ${report.totalAutonomousActions} autonomous actions`;
  const engramIds = collectEngramIds(report);

  db.insert(nudgeLog)
    .values({
      id,
      type: 'insight',
      title,
      body,
      engramIds: JSON.stringify(engramIds),
      priority: priorityFor(report),
      status: 'pending',
      createdAt: now.toISOString(),
      expiresAt: null,
      actionType: null,
      actionLabel: null,
      actionParams: JSON.stringify({
        source: 'glia-digest',
        period: report.period,
        startDate: report.startDate,
        endDate: report.endDate,
        totalAutonomousActions: report.totalAutonomousActions,
        anomalyCount: report.anomalies.length,
      }),
    })
    .run();

  logger.debug(
    { nudgeId: id, period: report.period, total: report.totalAutonomousActions },
    '[glia/digest] Shell digest delivered'
  );
  return true;
}

/**
 * Forward the digest body to Moltbot/Telegram.
 *
 * Returns `false` when no Telegram config is present (silent skip — matches
 * the ai-alerts behaviour). Throws on transport errors so the caller can
 * record the failure.
 */
export async function deliverMoltbotDigest(
  report: AutonomousDigestReport,
  body: string
): Promise<boolean> {
  const config = readTelegramConfig();
  if (!config) {
    logger.debug(
      { period: report.period },
      '[glia/digest] No Telegram config — skipping Moltbot delivery'
    );
    return false;
  }

  const header = `🧠 *Glia ${report.period} digest*`;
  // Telegram MarkdownV2 chokes on raw `.`, `(`, `)` etc — escape the plain
  // body before sending. The header is safe to leave un-escaped: `report.period`
  // is a union literal ('daily' | 'weekly'), so no user-controlled or
  // punctuation-bearing input reaches the formatted line.
  const text = `${header}\n\n${escapeTelegramMarkdownV2(body)}`;

  await fetchTransport.send(config, text);
  logger.debug(
    { period: report.period, total: report.totalAutonomousActions },
    '[glia/digest] Moltbot digest delivered'
  );
  return true;
}

function collectEngramIds(report: AutonomousDigestReport): string[] {
  const set = new Set<string>();
  for (const group of report.groups) {
    for (const entry of group.actions) {
      for (const id of entry.affectedIds) set.add(id);
    }
  }
  return [...set];
}

/** Default channel pair backed by nudge_log + Telegram. */
export const defaultDigestChannels: DigestDeliveryChannels = {
  shell: deliverShellDigest,
  moltbot: deliverMoltbotDigest,
};
