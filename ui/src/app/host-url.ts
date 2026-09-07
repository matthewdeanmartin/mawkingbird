/**
 * Turn whatever a user typed into a server box into a usable base URL.
 *
 * Most instances are reached over https, and users rarely type the scheme, so a bare
 * host gets `https://` prepended. The exception is local development targets — `localhost`,
 * a loopback name, or a raw IP address — which are commonly served over plain http; forcing
 * https there would break the obvious `localhost:3000` case. If the user already typed a
 * scheme we respect it verbatim.
 *
 * Returns '' for empty input (the "this server" / relative-URL sentinel used by Server).
 */
export function normalizeHostUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  if (!trimmed) {
    return '';
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  const scheme = isLocalHost(trimmed) ? 'http' : 'https';
  return `${scheme}://${trimmed}`;
}

/** IPv4 dotted-quad, optionally with a :port. */
const IPV4_RE = /^(\d{1,3}\.){3}\d{1,3}(:\d+)?$/;

/**
 * True for hosts that should default to http:// rather than https://: localhost, the
 * `*.localhost` suffix, the loopback IPs, `[::1]`, and any bare IPv4 address (LAN dev boxes).
 * The input here is a bare host[:port] — schemes are handled before this is called.
 */
export function isLocalHost(hostAndPort: string): boolean {
  const host = hostAndPort.replace(/:\d+$/, '').toLowerCase();
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '127.0.0.1' ||
    host === '[::1]' ||
    host === '::1' ||
    IPV4_RE.test(hostAndPort)
  );
}
