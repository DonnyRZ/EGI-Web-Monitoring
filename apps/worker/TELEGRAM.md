# Telegram notification notes (official Bot API)

Outbound alerts use **`sendMessage`** to a `chat_id` — not `getUpdates` (that is for receiving updates).

Sources:
- https://core.telegram.org/bots/api#sendmessage
- https://core.telegram.org/bots/faq (rate limits / broadcasting)

## Limits we implement

| Rule | Behavior |
|------|----------|
| Text length | Max **4096** chars after entities; we truncate |
| parse_mode | **HTML**; escape `& < >` in title/body |
| Per-chat rate | ~**1 message/second**; polite spacing (~1100ms) |
| Groups | FAQ: ~**20 messages/minute** per group |
| Bulk | ~**30 messages/second** overall (free tier) |
| HTTP **429** | Read `parameters.retry_after`; wait (capped 60s); **one** retry — never spam |
| Missing token | If `TELEGRAM_BOT_TOKEN` empty → mark notification **failed** with clear message (no fake success) |
| Chat target | Prefer `users.telegram_chat_id`, else env `TELEGRAM_CHAT_ID` |
| Secrets | Never log the bot token |

Notification failures never fail the monitoring check pipeline (max 3 BullMQ attempts for transient errors).
