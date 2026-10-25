import { AnonymousPublicRef } from './providers/anonymous/anonymous-route-ref';

/** Portable public identifiers; never share server-local IDs or private list state. */
export function radioPostRef(raw: string | null): AnonymousPublicRef | null {
  try {
    const url = new URL(raw ?? '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    const match = /^\/(?:@[^/]+\/|users\/[^/]+\/statuses\/|(?:web\/)?statuses\/)(\d+)\/?$/.exec(
      url.pathname,
    );
    return match
      ? { server: url.origin, id: match[1], originalUrl: `${url.origin}${url.pathname}` }
      : null;
  } catch {
    return null;
  }
}

export function radioAccount(raw: string | null): { acct: string; server: string } | null {
  const acct = (raw ?? '').trim().replace(/^@/, '');
  const match = /^([^\s@/?#]+)@([a-z0-9.-]+)$/i.exec(acct);
  if (!match || !match[2].includes('.')) return null;
  return { acct, server: `https://${match[2].toLowerCase()}` };
}

export function radioLink(base: string, params: { acct?: string; post?: string }): string {
  const url = new URL('radio', base);
  if (params.post) url.searchParams.set('post', params.post);
  else if (params.acct) url.searchParams.set('acct', params.acct);
  return url.href;
}
