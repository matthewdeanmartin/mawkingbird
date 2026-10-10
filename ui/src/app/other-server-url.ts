/** Canonical host for a public server feed, independent of the signed-in instance. */
export function otherServerHost(value: string | null): string | null {
  if (!value) return null;
  const host = value
    .trim()
    .replace(/^https:\/\//i, '')
    .replace(/\/$/, '');
  if (/[\s/\\@?#]/.test(host)) return null;
  try {
    const url = new URL(`https://${host}`);
    if (!url.hostname.includes('.') && url.hostname !== 'localhost') return null;
    return url.host.toLowerCase();
  } catch {
    return null;
  }
}
