export type LiveWebsiteUrl = {
  href: string;
  hostname: string;
};

/**
 * Only registered web URLs can be opened by the direct viewer. This is a
 * client-side guard for the UI; the browser still enforces framing policy
 * such as CSP and X-Frame-Options.
 */
export function normalizeLiveWebsiteUrl(value?: string | null): LiveWebsiteUrl | null {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    return { href: url.toString(), hostname: url.hostname };
  } catch {
    return null;
  }
}

export function isSupportedLiveWebsiteUrl(value?: string | null) {
  return normalizeLiveWebsiteUrl(value) !== null;
}
