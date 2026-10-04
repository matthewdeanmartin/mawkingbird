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

/** mDNS household servers need time for name discovery and constrained hardware. */
export function isLocalNetworkServer(value: string): boolean {
  try {
    return new URL(normalizeHostUrl(value)).hostname
      .toLowerCase()
      .replace(/\.$/, '')
      .endsWith('.local');
  } catch {
    return false;
  }
}

export function serverProbeTimeout(value: string, publicTimeoutMs = 6000): number {
  return isLocalNetworkServer(value) ? 15000 : publicTimeoutMs;
}

/** Public recovery links accept only web origins, never credentials. */
export function connectionHelpServer(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(normalizeHostUrl(value));
    return /^https?:$/.test(url.protocol) && !url.username && !url.password ? url.origin : null;
  } catch {
    return null;
  }
}

/** Household targets should stay direct, never be sent to an Internet CORS relay. */
export function isPrivateNetworkServer(value: string): boolean {
  try {
    const host = new URL(normalizeHostUrl(value)).hostname.toLowerCase().replace(/\.$/, '');
    if (
      host === 'localhost' ||
      /\.(local|localhost|lan|internal)$/.test(host) ||
      host.endsWith('.home.arpa')
    )
      return true;
    const octets = host.split('.').map(Number);
    if (
      octets.length === 4 &&
      octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ) {
      const [a, b] = octets;
      return (
        a === 10 ||
        a === 127 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168) ||
        (a === 169 && b === 254)
      );
    }
    return host === '[::1]' || /^\[(?:f[cd]|fe[89ab])/.test(host);
  } catch {
    return false;
  }
}
