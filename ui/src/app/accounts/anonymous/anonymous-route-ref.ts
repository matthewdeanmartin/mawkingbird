/** A public Mastodon object address carried in a single Angular route segment. */
export interface AnonymousPublicRef {
  server: string;
  id: string;
  originalUrl?: string;
}

const ACCOUNT_PREFIX = 'anonymous-account.';
const STATUS_PREFIX = 'anonymous-status.';

function normalize(ref: AnonymousPublicRef): AnonymousPublicRef | null {
  try {
    const url = new URL(ref.server);
    if (!['http:', 'https:'].includes(url.protocol) || !ref.id.trim()) {
      return null;
    }
    const originalUrl = ref.originalUrl?.trim();
    if (originalUrl) {
      const original = new URL(originalUrl);
      if (!['http:', 'https:'].includes(original.protocol)) {
        return null;
      }
    }
    return { server: url.origin, id: ref.id.trim(), ...(originalUrl ? { originalUrl } : {}) };
  } catch {
    return null;
  }
}

function encode(prefix: string, ref: AnonymousPublicRef): string {
  const valid = normalize(ref);
  if (!valid) {
    throw new Error('Invalid anonymous public Mastodon reference.');
  }
  const bytes = new TextEncoder().encode(JSON.stringify(valid));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `${prefix}${btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}`;
}

function decode(prefix: string, value: string): AnonymousPublicRef | null {
  if (!value.startsWith(prefix)) return null;
  try {
    const encoded = value.slice(prefix.length).replace(/-/g, '+').replace(/_/g, '/');
    const binary = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return normalize(JSON.parse(new TextDecoder().decode(bytes)) as AnonymousPublicRef);
  } catch {
    return null;
  }
}

export function anonymousAccountRouteRef(ref: AnonymousPublicRef): string {
  return encode(ACCOUNT_PREFIX, ref);
}

export function anonymousStatusRouteRef(ref: AnonymousPublicRef): string {
  return encode(STATUS_PREFIX, ref);
}

export function parseAnonymousAccountRouteRef(value: string): AnonymousPublicRef | null {
  return decode(ACCOUNT_PREFIX, value);
}

export function parseAnonymousStatusRouteRef(value: string): AnonymousPublicRef | null {
  return decode(STATUS_PREFIX, value);
}
