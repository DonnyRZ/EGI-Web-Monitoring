/**
 * Telegram Bot API outbound alerts (official docs):
 * https://core.telegram.org/bots/api#sendmessage
 * https://core.telegram.org/bots/faq
 *
 * Key limits we respect:
 * - Outbound alerts use sendMessage to chat_id (not getUpdates).
 * - Text: 1–4096 characters after entities parsing.
 * - parse_mode: we use HTML; escape < > & in user content.
 * - Rate limits (Bots FAQ): ~1 msg/sec per chat; ~20 msg/min per group;
 *   ~30 msg/sec bulk. On HTTP 429, honor parameters.retry_after seconds
 *   (ResponseParameters.retry_after) before one polite retry — never spam.
 * - Never log TELEGRAM_BOT_TOKEN.
 * - If TELEGRAM_BOT_TOKEN is empty, do not fake success; return a clear error.
 */

const TELEGRAM_API = "https://api.telegram.org";
const MAX_TEXT = 4096;

export class TelegramConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TelegramConfigError";
  }
}

export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
    readonly retryAfterSec?: number,
  ) {
    super(message);
    this.name = "TelegramApiError";
  }
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function truncateTelegramText(text: string): string {
  if (text.length <= MAX_TEXT) return text;
  return `${text.slice(0, MAX_TEXT - 1)}…`;
}

export interface SendTelegramOptions {
  botToken: string;
  chatId: string;
  title: string;
  message: string;
  /** Optional polite delay between sends (ms). Default 1100 (~1/sec per chat). */
  minIntervalMs?: number;
}

let lastSendAt = 0;

async function politeWait(minIntervalMs: number): Promise<void> {
  const elapsed = Date.now() - lastSendAt;
  if (elapsed < minIntervalMs) {
    await sleep(minIntervalMs - elapsed);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * POST /bot{token}/sendMessage — never include token in logs/errors.
 */
export async function sendTelegramMessage(
  options: SendTelegramOptions,
): Promise<void> {
  const token = options.botToken.trim();
  if (!token) {
    throw new TelegramConfigError(
      "TELEGRAM_BOT_TOKEN is empty; Telegram send skipped",
    );
  }
  const chatId = options.chatId.trim();
  if (!chatId) {
    throw new TelegramConfigError("Telegram chat_id is empty");
  }

  const minIntervalMs = options.minIntervalMs ?? 1_100;
  await politeWait(minIntervalMs);

  const text = truncateTelegramText(
    `<b>${escapeHtml(options.title)}</b>\n${escapeHtml(options.message)}`,
  );

  const url = `${TELEGRAM_API}/bot${token}/sendMessage`;
  const body = {
    chat_id: chatId,
    text,
    parse_mode: "HTML",
    disable_web_page_preview: true,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  lastSendAt = Date.now();

  const payload = (await response.json().catch(() => null)) as {
    ok?: boolean;
    description?: string;
    error_code?: number;
    parameters?: { retry_after?: number };
  } | null;

  if (response.status === 429 || payload?.error_code === 429) {
    const retryAfter =
      payload?.parameters?.retry_after ??
      (Number(response.headers.get("Retry-After") || 0) || 5);
    throw new TelegramApiError(
      `Telegram flood control (429); retry after ${retryAfter}s`,
      429,
      retryAfter,
    );
  }

  if (!response.ok || !payload?.ok) {
    const desc = payload?.description ?? `HTTP ${response.status}`;
    // Strip any accidental token leakage from description
    throw new TelegramApiError(
      `Telegram sendMessage failed: ${desc.replace(token, "[redacted]")}`,
      response.status,
    );
  }
}

/**
 * Send with a single 429 backoff retry (honor retry_after). No retry loops.
 */
export async function sendTelegramWithBackoff(
  options: SendTelegramOptions,
): Promise<void> {
  try {
    await sendTelegramMessage(options);
  } catch (error) {
    if (
      error instanceof TelegramApiError &&
      error.statusCode === 429 &&
      error.retryAfterSec
    ) {
      // Cap wait at 60s for MVP so notification worker does not hang forever
      const waitSec = Math.min(error.retryAfterSec, 60);
      await sleep(waitSec * 1000);
      await sendTelegramMessage(options);
      return;
    }
    throw error;
  }
}
