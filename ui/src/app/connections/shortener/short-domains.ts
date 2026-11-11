/**
 * Which hosts this browser's short links live on. Kept free of services and
 * dependencies so link cleaning in the eager API path can read it cheaply.
 */

/** Where shortener settings keep the non-secret config (provider and custom domains). */
export const SHORTENER_CONFIG_KEY = 'mockingbird_shortener';

/** Each provider's shared short domain, used when no custom one is set (see the catalogue). */
export const DEFAULT_SHORT_DOMAINS: readonly string[] = [
  'tinyurl.com',
  'is.gd',
  'dub.sh',
  't.ly',
  'rebrand.ly',
];

/** The shared short domains plus every custom short domain configured in this browser. */
export function shortDomains(): string[] {
  const custom: string[] = [];
  try {
    const raw = localStorage.getItem(SHORTENER_CONFIG_KEY);
    const domains = raw ? (JSON.parse(raw) as { domains?: Record<string, unknown> }).domains : null;
    for (const value of Object.values(domains ?? {})) {
      if (typeof value === 'string' && value.trim()) custom.push(value.trim());
    }
  } catch {
    // Unreadable or malformed config: the shared domains still apply.
  }
  return [...DEFAULT_SHORT_DOMAINS, ...custom];
}
