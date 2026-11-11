/**
 * Pure helpers for profile QR codes. Kept apart from the dialog so the parsing
 * rules are testable without a camera, and so nothing here pulls in `qr`.
 */

/** A handle such as `@user@host` or `user@host`. */
const HANDLE = /^@?([\w.-]+)@([\w-]+(?:\.[\w-]+)+)$/u;

/**
 * Profile-shaped URL paths: Mastodon (`/@user`, `/users/user`), Misskey and
 * Sharkey (`/@user`), Pleroma/Akkoma (`/users/user`, `/user`). Status links
 * (`/@user/123`) are refused: this scanner opens accounts, not posts.
 */
const PROFILE_PATH = /^\/(?:@[\w.-]+(?:@[\w.-]+)?|users\/[\w.-]+)\/?$/u;

/**
 * What to ask the signed-in server to resolve for a scanned QR payload, or
 * null when the payload is not a supported profile link or handle.
 */
export function scannedAccountQuery(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const handle = HANDLE.exec(text);
  if (handle) return `@${handle[1]}@${handle[2]}`;
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (!PROFILE_PATH.test(url.pathname)) return null;
  return `${url.origin}${url.pathname.replace(/\/$/u, '')}`;
}

/** True when the browser can offer a camera to scan with. */
export function cameraScanSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}
