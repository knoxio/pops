/**
 * Digest delivery channels for `cerebrum.glia.digest`.
 *
 * Two channels:
 *
 *   - shell:  persists the digest as a `nudge_log` row in the pillar DB so the
 *     existing nudge UI can surface it. Always available.
 *   - telegram: forwards the body to a Telegram chat (Moltbot). Cross-module in
 *     the monolith (`core/ai-alerts/dispatchers/telegram`); the pillar has no
 *     ai-alerts module, so a minimal env-gated sender is inlined here. When the
 *     bot token / chat id env vars are unset it is a silent no-op (returns
 *     false), exactly as the monolith behaved when Moltbot was unconfigured.
 *
 * The `deliver: false` path and the shell channel both work without any
 * Telegram configuration.
 */
import { randomUUID } from 'node:crypto';

import { nudgeLog, type CerebrumDb } from '../../../db/index.js';

import type { AutonomousDigestReport } from './autonomous-digest.js';

/** A single delivery channel's outcome. */
export interface DeliveryChannelResult {
  channel: 'shell' | 'moltbot';
  delivered: boolean;
  /** Reason for non-delivery — populated when `delivered=false`. */
  reason: string | null;
}

/** Channels invoked by the digest delivery step. */
export interface DigestDeliveryChannels {
  /** Persist a shell notification. Returns true when accepted. */
  shell: (report: AutonomousDigestReport, body: string) => Promise<boolean> | boolean;
  /** Forward to Moltbot/Telegram. Returns true when sent, false when unconfigured. */
  moltbot: (report: AutonomousDigestReport, body: string) => Promise<boolean>;
}

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

function collectEngramIds(report: AutonomousDigestReport): string[] {
  const set = new Set<string>();
  for (const group of report.groups) {
    for (const entry of group.actions) {
      for (const id of entry.affectedIds) set.add(id);
    }
  }
  return [...set];
}

/**
 * Persist the digest as a shell notification row in `nudge_log`. Engram IDs are
 * union'd across all groups so the existing nudge UI can deep-link back to the
 * affected engrams without a dedicated digest viewer.
 */
export function deliverShellDigest(
  db: CerebrumDb,
  report: AutonomousDigestReport,
  body: string,
  now: Date = new Date()
): boolean {
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

  return true;
}

interface TelegramConfig {
  botToken: string;
  chatId: string;
}

/** Read Telegram config from env. Returns null when either var is unset. */
export function readTelegramConfig(env: NodeJS.ProcessEnv = process.env): TelegramConfig | null {
  const botToken = env['POPS_ALERTS_TELEGRAM_BOT_TOKEN'];
  const chatId = env['POPS_ALERTS_TELEGRAM_CHAT_ID'];
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

/** Escape every Telegram MarkdownV2 reserved character. */
function escapeTelegramMarkdownV2(value: string): string {
  return value.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000;

async function sendTelegram(config: TelegramConfig, text: string): Promise<void> {
  const url = `https://api.telegram.org/bot${config.botToken}/sendMessage`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TELEGRAM_REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        chat_id: config.chatId,
        text,
        parse_mode: 'MarkdownV2',
        disable_web_page_preview: true,
      }),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Telegram sendMessage timed out after ${TELEGRAM_REQUEST_TIMEOUT_MS}ms`, {
        cause: err,
      });
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '<no body>');
    throw new Error(`Telegram sendMessage failed: ${res.status} ${body}`);
  }
}

/**
 * Forward the digest body to Moltbot/Telegram. Returns `false` when no Telegram
 * config is present (silent no-op); throws on transport errors so the caller
 * records the failure against the channel.
 */
export async function deliverMoltbotDigest(
  report: AutonomousDigestReport,
  body: string
): Promise<boolean> {
  const config = readTelegramConfig();
  if (!config) return false;

  const header = `🧠 *Glia ${report.period} digest*`;
  // `report.period` is a union literal so the header carries no reserved chars;
  // only the dynamic body needs escaping for MarkdownV2.
  const text = `${header}\n\n${escapeTelegramMarkdownV2(body)}`;

  await sendTelegram(config, text);
  return true;
}

/**
 * Build the default channel pair bound to a pillar DB handle. The shell channel
 * writes `nudge_log`; the Telegram channel is env-gated and a no-op when
 * unconfigured.
 */
export function buildDefaultDigestChannels(db: CerebrumDb): DigestDeliveryChannels {
  return {
    shell: (report, body) => deliverShellDigest(db, report, body),
    moltbot: deliverMoltbotDigest,
  };
}
