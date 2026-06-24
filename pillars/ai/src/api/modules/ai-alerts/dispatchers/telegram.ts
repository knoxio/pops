/**
 * Telegram dispatcher for AI alerts.
 *
 * Pushes a message to the Moltbot Telegram chat using the Bot API directly.
 * The bot token + chat ID are read from environment variables:
 *
 *   POPS_ALERTS_TELEGRAM_BOT_TOKEN   the bot token (same one moltbot uses)
 *   POPS_ALERTS_TELEGRAM_CHAT_ID     the chat ID to deliver to
 *
 * When either variable is unset the dispatcher is treated as not configured
 * and silently skips delivery.
 */
import { logger } from '../../../shared/logger.js';

import type { FiredAlert } from '../types.js';

export interface TelegramConfig {
  botToken: string;
  chatId: string;
}

export interface TelegramTransport {
  send: (config: TelegramConfig, text: string) => Promise<void>;
}

/** Max time we wait for Telegram to ack a sendMessage before aborting. */
export const TELEGRAM_REQUEST_TIMEOUT_MS = 10_000;

/** Read config from env. Returns null when unset. */
export function readTelegramConfig(env: NodeJS.ProcessEnv = process.env): TelegramConfig | null {
  const botToken = env['POPS_ALERTS_TELEGRAM_BOT_TOKEN'];
  const chatId = env['POPS_ALERTS_TELEGRAM_CHAT_ID'];
  if (!botToken || !chatId) return null;
  return { botToken, chatId };
}

/**
 * Escape every Telegram MarkdownV2 reserved character.
 *
 * Telegram rejects messages where a reserved character appears unescaped in
 * dynamic text — user-controlled fields like rule names or scope identifiers
 * can easily contain `_`, `*`, `[`, `]`, `.`, etc. We use MarkdownV2 (rather
 * than the legacy `Markdown` mode) because its escaping rules are explicitly
 * documented and predictable.
 */
export function escapeTelegramMarkdownV2(value: string): string {
  return value.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');
}

/** Default transport using the global `fetch` with a hard request timeout. */
export const fetchTransport: TelegramTransport = {
  async send(config, text) {
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
  },
};

/**
 * Render an alert as the Telegram message body. All interpolated dynamic
 * content is escaped for MarkdownV2 so user-controllable values (rule type,
 * scope identifier, message body) cannot break Telegram's parser or inject
 * formatting.
 */
export function renderTelegramMessage(alert: FiredAlert): string {
  const severityEmoji = alert.severity === 'critical' ? '🚨' : '⚠️';
  const type = escapeTelegramMarkdownV2(alert.type);
  const message = escapeTelegramMarkdownV2(alert.message);
  const scope = alert.scopeDetail ? `\n_${escapeTelegramMarkdownV2(alert.scopeDetail)}_` : '';
  // Em-dash is not MarkdownV2-reserved; the literal heading text is safe.
  return `${severityEmoji} *AI Alert — ${type}*${scope}\n${message}`;
}

/**
 * Dispatch the alert via Telegram. Returns `true` when a message was sent,
 * `false` when the dispatcher was not configured (no-op). Throws on transport
 * errors so the caller can decide whether to retry.
 */
export async function dispatchTelegram(
  alert: FiredAlert,
  options: { config?: TelegramConfig | null; transport?: TelegramTransport } = {}
): Promise<boolean> {
  const config = options.config === undefined ? readTelegramConfig() : options.config;
  if (!config) {
    logger.debug(
      { alertId: alert.id },
      '[ai-alerts/telegram] No Telegram config — skipping dispatch'
    );
    return false;
  }
  const transport = options.transport ?? fetchTransport;
  const text = renderTelegramMessage(alert);
  await transport.send(config, text);
  return true;
}
