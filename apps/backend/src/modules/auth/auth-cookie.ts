export const REFRESH_COOKIE_NAME = "egi_refresh_token";

/** Minimal cookie reader avoids adding a parser dependency just for one
 * HttpOnly refresh cookie. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name && value.length) {
      try {
        return decodeURIComponent(value.join("="));
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
}
